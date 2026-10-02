// Deploy: supabase functions deploy billing-cron --no-verify-jwt
// (--no-verify-jwt because pg_cron calls this on a schedule, not a signed-in user)
//
// This is the automatic version of the same rules the client already applies
// when an owner opens the app (runStoreBillingCleanup in app.js) — but it
// runs on every store, on a schedule, whether or not anyone is signed in:
//   - locks a store the moment its trial/paid access runs out
//   - marks the 30-day and 60-day "locked" reminders as sent
//   - opens the 14-day grace period at day 90 locked
//   - deletes the store (and its banner/logo files) once the grace period ends
// Only the store row + storefront is removed — accounts and listings are
// never touched by this function.
//
// Reminder EMAILS are optional. Set RESEND_API_KEY + NOTIFY_FROM_EMAIL to
// actually send them; without those two secrets, the function still does all
// the locking/deletion, it just skips sending mail.
//
// Secrets needed (supabase secrets set NAME=value):
//   CRON_SECRET          - any random string; must match what you put in the
//                          pg_cron job below, so only your own scheduler can
//                          trigger this (it's deployed with --no-verify-jwt).
//   RESEND_API_KEY        - optional, for reminder emails
//   NOTIFY_FROM_EMAIL     - optional, e.g. "LinkHub <noreply@yourdomain.com>"
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are already provided automatically.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const NOTIFY_FROM_EMAIL = Deno.env.get('NOTIFY_FROM_EMAIL')

const DAY_MS = 24 * 60 * 60 * 1000
const GRACE_DAYS = 14
const DELETION_WARNING_DAYS = 90

type StoreRow = Record<string, any>

// Same rules as computeStoreAccess() in app.js — keep the two in sync if you
// change one.
function computeAccess(store: StoreRow) {
  if (!store?.name) return { status: 'none' as const }
  const isLegacyUnmigrated = !store.plan && !store.trial_confirmed_at && !store.legacy_migration_choice
  if (isLegacyUnmigrated) return { status: 'legacy_choice_required' as const }
  if (store.legacy_migration_choice === 'declined') return { status: 'deleted' as const }

  const now = Date.now()
  const paidUntil = store.paid_until ? new Date(store.paid_until).getTime() : 0
  const trialEnds = store.trial_ends_at ? new Date(store.trial_ends_at).getTime() : 0

  if (paidUntil > now) return { status: 'active' as const }
  if (trialEnds > now) return { status: 'trial' as const }
  if (!trialEnds && !paidUntil) return { status: 'awaiting_plan' as const }

  const lockedAt = store.locked_at ? new Date(store.locked_at).getTime() : Math.max(trialEnds, paidUntil)
  const daysLocked = (now - lockedAt) / DAY_MS

  if (daysLocked >= DELETION_WARNING_DAYS) {
    const warnedAt = store.deletion_warned_at
      ? new Date(store.deletion_warned_at).getTime()
      : lockedAt + DELETION_WARNING_DAYS * DAY_MS
    const graceUntil = store.grace_until
      ? new Date(store.grace_until).getTime()
      : warnedAt + GRACE_DAYS * DAY_MS
    if (now > graceUntil) return { status: 'delete_due' as const }
    return { status: 'pending_deletion' as const }
  }

  let reminderDue: 30 | 60 | null = null
  if (daysLocked >= 60 && !store.reminder_60_sent_at) reminderDue = 60
  else if (daysLocked >= 30 && !store.reminder_30_sent_at) reminderDue = 30

  return { status: 'locked' as const, reminderDue }
}

async function updateStoreRow(userId: string, fields: Record<string, unknown>) {
  const { error } = await admin.from('stores').update(fields).eq('id', userId)
  if (error) await admin.from('stores').update(fields).eq('user_id', userId)
}

async function deleteStoreRow(store: StoreRow, userId: string) {
  const paths: string[] = []
  for (const url of [store.banner_url, store.logo_url].filter(Boolean)) {
    const marker = '/store-assets/'
    const idx = String(url).indexOf(marker)
    if (idx !== -1) paths.push(decodeURIComponent(String(url).slice(idx + marker.length)))
  }
  if (paths.length) {
    try { await admin.storage.from('store-assets').remove(paths) }
    catch (e) { console.warn('Could not remove store images for', userId, e) }
  }
  const { error } = await admin.from('stores').delete().eq('id', userId)
  if (error) await admin.from('stores').delete().eq('user_id', userId)
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}

async function sendReminderEmail(toEmail: string, subject: string, text: string) {
  if (!RESEND_API_KEY || !NOTIFY_FROM_EMAIL || !toEmail) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: NOTIFY_FROM_EMAIL, to: toEmail, subject, text })
    })
  } catch (e) {
    console.warn('Reminder email failed for', toEmail, e)
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const { data: stores, error } = await admin.from('stores').select('*')
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  let locked = 0, reminded = 0, warned = 0, deleted = 0

  for (const store of stores ?? []) {
    const userId = store.id ?? store.user_id
    if (!userId) continue
    const access = computeAccess(store)
    const nowIso = new Date().toISOString()

    if (access.status === 'locked' && !store.locked_at) {
      await updateStoreRow(userId, { locked_at: nowIso })
      locked++
      continue
    }

    if (access.status === 'locked' && access.reminderDue) {
      const field = access.reminderDue === 30 ? 'reminder_30_sent_at' : 'reminder_60_sent_at'
      await updateStoreRow(userId, { [field]: nowIso })
      const email = await getUserEmail(userId)
      if (email) {
        await sendReminderEmail(
          email,
          `Your LinkHub store "${store.name}" is locked`,
          `Your store has been locked for ${access.reminderDue} days with no payment. Pay in "My Store" to restore it — it will be deleted automatically after 90 days locked, with a final 14-day warning.`
        )
      }
      reminded++
      continue
    }

    if (access.status === 'pending_deletion' && !store.deletion_warned_at) {
      const graceUntil = new Date(Date.now() + GRACE_DAYS * DAY_MS).toISOString()
      await updateStoreRow(userId, { deletion_warned_at: nowIso, grace_until: graceUntil })
      const email = await getUserEmail(userId)
      if (email) {
        await sendReminderEmail(
          email,
          `Final warning: your LinkHub store will be deleted`,
          `Your store "${store.name}" will be deleted in ${GRACE_DAYS} days unless you pay. Your LinkHub account and marketplace listings will be kept either way.`
        )
      }
      warned++
      continue
    }

    if (access.status === 'delete_due') {
      await deleteStoreRow(store, userId)
      deleted++
    }
  }

  return new Response(JSON.stringify({ locked, reminded, warned, deleted }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
