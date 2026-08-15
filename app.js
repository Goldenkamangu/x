import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

function loadStoredJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function saveStoredJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

const localImageStore = {}
const localState = {
  users: loadStoredJSON('marketmeet-users', []),
  listings: loadStoredJSON('marketmeet-listings', []),
  session: loadStoredJSON('marketmeet-session', null)
}

function persistLocalState() {
  saveStoredJSON('marketmeet-users', localState.users)
  saveStoredJSON('marketmeet-listings', localState.listings)
  saveStoredJSON('marketmeet-session', localState.session)
}

const localDb = {
  auth: {
    async signUp({ email, password, options }) {
      const fullName = options?.data?.full_name || ''
      const existingUser = localState.users.find((user) => user.email.toLowerCase() === email.toLowerCase())
      if (existingUser) {
        if (fullName) existingUser.full_name = fullName
        localState.session = { user: { id: existingUser.id, email: existingUser.email, user_metadata: { full_name: existingUser.full_name || '' } } }
        persistLocalState()
        return { data: { user: localState.session.user }, error: null }
      }

      const user = { id: crypto.randomUUID?.() || `${Date.now()}`, email, password, full_name: fullName }
      localState.users.push(user)
      localState.session = { user: { id: user.id, email: user.email, user_metadata: { full_name: fullName } } }
      persistLocalState()
      return { data: { user: localState.session.user }, error: null }
    },

    async signInWithPassword({ email, password }) {
      const user = localState.users.find((entry) => entry.email.toLowerCase() === email.toLowerCase() && entry.password === password)
      if (!user) {
        return { data: { user: null }, error: { message: 'Invalid email or password' } }
      }

      localState.session = { user: { id: user.id, email: user.email, user_metadata: { full_name: user.full_name || '' } } }
      persistLocalState()
      return { data: { user: localState.session.user }, error: null }
    },

    async updateUser(attributes = {}) {
      const id = localState.session?.user?.id
      const user = localState.users.find((entry) => entry.id === id)
      if (!user) return { data: { user: null }, error: { message: 'You are not signed in.' } }
      if (attributes.email && attributes.email.toLowerCase() !== user.email.toLowerCase()) {
        if (localState.users.some((entry) => entry.id !== id && entry.email.toLowerCase() === attributes.email.toLowerCase())) {
          return { data: { user: null }, error: { message: 'That email address is already in use.' } }
        }
        user.email = attributes.email
      }
      if (attributes.password) user.password = attributes.password
      if (attributes.data?.full_name !== undefined) user.full_name = attributes.data.full_name
      localState.session.user.email = user.email
      localState.session.user.user_metadata = { full_name: user.full_name || '' }
      persistLocalState()
      return { data: { user: localState.session.user }, error: null }
    },

    async deleteUser() {
      const id = localState.session?.user?.id
      if (!id) return { error: { message: 'You are not signed in.' } }
      localState.users = localState.users.filter((entry) => entry.id !== id)
      localState.listings = localState.listings.filter((entry) => entry.user_id !== id)
      localState.session = null
      persistLocalState()
      return { error: null }
    },

    async signOut() {
      localState.session = null
      persistLocalState()
      return { error: null }
    },

    async getUser() {
      return { data: { user: localState.session?.user || null } }
    },

    onAuthStateChange(callback) {
      callback(null, localState.session)
      return () => {}
    }
  },

  from(table) {
    if (table === 'listings') {
      return {
        async insert(rows) {
          const createdRows = rows.map((row, index) => ({
            ...row,
            id: `${Date.now()}-${index}`,
            created_at: new Date().toISOString()
          }))
          localState.listings.unshift(...createdRows)
          persistLocalState()
          return { error: null }
        },

        async select() {
          return {
            data: [...localState.listings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
            error: null
          }
        }
      }
    }

    return {
      async select() {
        return { data: [], error: null }
      }
    }
  },

  storage: {
    from() {
      return {
        async upload(path, file) {
          localImageStore[path] = file
          return { error: null, data: { path } }
        },
        getPublicUrl(path) {
          const file = localImageStore[path]
          return { data: { publicUrl: file ? URL.createObjectURL(file) : null } }
        }
      }
    }
  }
}

const SUPABASE_URL = 'https://izdwacnhqrtsgngmsigu.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6ZHdhY25ocXJ0c2duZ21zaWd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NDk4MjksImV4cCI6MjEwMTUyNTgyOX0.coV2SWeECtgXNeLtHOJ2T6_ekmV7Ynya35Ewl8oH7GI'
const useSupabase = SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL !== 'SUPABASE_URL'
// AI search Edge Function — deploy this function (see ai-search-function.ts) then leave as-is
const AI_SEARCH_URL = `${SUPABASE_URL}/functions/v1/rapid-function`

const db = useSupabase
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : (console.warn('Supabase is not configured. Using localStorage fallback.'), localDb)

// Elements
const authArea = document.getElementById('auth-area')
const nameEl = document.getElementById('name')
const emailEl = document.getElementById('email')
const passwordEl = document.getElementById('password')
const btnSignup = document.getElementById('btn-signup')
const btnLogin = document.getElementById('btn-login')
const authMsg = document.getElementById('auth-msg')
const authSection = document.getElementById('auth-section')
const accountOverlay = document.getElementById('account-overlay')
const accountClose = document.getElementById('account-close')
const accountCancel = document.getElementById('account-cancel')
const accountForm = document.getElementById('account-form')
const accountName = document.getElementById('account-name')
const accountEmail = document.getElementById('account-email')
const accountPassword = document.getElementById('account-password')
const accountPasswordConfirm = document.getElementById('account-password-confirm')
const accountMsg = document.getElementById('account-msg')
const accountDelete = document.getElementById('account-delete')
const accountCorner = document.getElementById('btn-account-corner')

// Keep the account gear anchored to the viewport even on browsers with
// unusual fixed-position behaviour during scrolling.
if (accountCorner) {
  const pinAccountCorner = () => {
    accountCorner.style.position = 'fixed';
    accountCorner.style.transform = 'translate3d(0,0,0)';
  };
  window.addEventListener('scroll', pinAccountCorner, { passive: true });
  window.addEventListener('resize', pinAccountCorner);
  pinAccountCorner();
}

const createListingSection = document.getElementById('create-listing-section')
const titleEl = document.getElementById('title')
const priceEl = document.getElementById('price')
const priceCurrencyEl = document.getElementById('price-currency')
const paymentTypeEl = document.getElementById('payment-type')
const deliveryTypeEl = document.getElementById('delivery-type')
const urlEl = document.getElementById('url')
const categoryEl = document.getElementById('category')
const contactMethodEl = document.getElementById('contact-method')
const contactDetailsEl = document.getElementById('contact-details')
const descEl = document.getElementById('description')
const imageEl = document.getElementById('image')
imageEl?.addEventListener('change', () => {
  if (imageEl.files && imageEl.files.length > 3) {
    imageEl.value = ''
    showFormError('Please choose no more than 3 pictures.', imageEl)
  }
})
const locationEl = document.getElementById('location')
const formEyebrow = document.getElementById('create-form-eyebrow')
const formHeading = document.getElementById('create-form-heading')
const editModeBadge = document.getElementById('edit-mode-badge')
const toggleMoreBtn = document.getElementById('toggle-more')
const createListingBtn = document.getElementById('create-listing')
const cancelEditBtn = document.getElementById('cancel-edit')
const listingMsg = document.getElementById('listing-msg')
const listCount = document.getElementById('list-count')
const listingsContainer = document.getElementById('listings')
const searchEl = document.getElementById('search-input')
const categoryChipsEl = document.getElementById('category-chips')
let currentListings = []
let currentUser = null
let editingId = null
let activeCategory = ''
let sortMode = 'newest'
const PAGE_SIZE = 20
let visibleCount = PAGE_SIZE
const sortSelect = document.getElementById('sort-select')
sortSelect?.addEventListener('change', () => {
  sortMode = sortSelect.value
  visibleCount = PAGE_SIZE
  renderFilteredListings()
})
searchEl?.addEventListener('input', () => { visibleCount = PAGE_SIZE })

function sortListings(items) {
  const withNum = (item) => { const n = Number(item.price); return Number.isFinite(n) ? n : null }
  const arr = [...items]
  if (sortMode === 'price-low') {
    arr.sort((a, b) => { const pa = withNum(a), pb = withNum(b); if (pa == null) return 1; if (pb == null) return -1; return pa - pb })
  } else if (sortMode === 'price-high') {
    arr.sort((a, b) => { const pa = withNum(a), pb = withNum(b); if (pa == null) return 1; if (pb == null) return -1; return pb - pa })
  } else if (sortMode === 'oldest') {
    arr.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
  } else {
    arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  }
  return arr
}

// Favorites are stored locally per-device — no account/table needed, works instantly.
// Favorites require an account and are scoped per-user (not shared across
// accounts on the same device), but still stored locally — no new table needed.
function favoritesStorageKey() {
  return currentUser ? `favorited-listings-${currentUser.id}` : null
}
let favoritedIds = new Set()
function loadFavoritesForCurrentUser() {
  const key = favoritesStorageKey()
  favoritedIds = new Set(key ? JSON.parse(localStorage.getItem(key) || '[]') : [])
}
function persistFavorites() {
  const key = favoritesStorageKey()
  if (key) localStorage.setItem(key, JSON.stringify([...favoritedIds]))
}
loadFavoritesForCurrentUser()


function getListingImages(listing) {
  const raw = listing?.image_urls ?? listing?.images ?? null
  let urls = []
  if (Array.isArray(raw)) urls = raw
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      urls = Array.isArray(parsed) ? parsed : []
    } catch {
      urls = raw.split(/\s*,\s*/).filter(Boolean)
    }
  }
  if (listing?.image_url && !urls.includes(listing.image_url)) urls.unshift(listing.image_url)
  return urls.filter(Boolean)
}

function isValidImageUrl(value) {
  return typeof value === 'string' && (value.startsWith('https://') || value.startsWith('http://') || value.startsWith('blob:') || value.startsWith('data:'))
}

function normalizeWhatsAppNumber(details) {
  const raw = String(details || '').trim()
  if (!raw) return null

  // Accept common South African formats:
  // +27 6XXXXXXXX, 0027 6XXXXXXXX, or local 06XXXXXXXX.
  const cleaned = raw.replace(/[^0-9+]/g, '')
  if (!cleaned) return null

  if (cleaned.startsWith('00')) {
    const digits = cleaned.slice(2).replace(/[^0-9]/g, '')
    return digits || null
  }

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/[^0-9]/g, '')
    return digits || null
  }

  const digits = cleaned.replace(/[^0-9]/g, '')
  if (!digits) return null

  // Local South African numbers beginning with 0 are converted to +27.
  if (digits.startsWith('0')) return `27${digits.slice(1)}`

  // Already an international-style number without a plus.
  return digits
}

function buildWhatsAppUrl(details) {
  const number = normalizeWhatsAppNumber(details)
  if (!number) return null
  return `https://wa.me/${number}`
}

function formatLocation(value) {
  return String(value || '').trim()
}

function showFormError(message, field) {
  listingMsg.textContent = message
  if (field) {
    field.focus()
    field.setAttribute('aria-invalid', 'true')
    setTimeout(() => field.removeAttribute('aria-invalid'), 1800)
  }
  return false
}

// Listings narrowed by the active category chip — used as the starting
// point for both plain search and Carty.
function getScopedListings() {
  let base = currentListings
  if (activeCategory) {
    base = base.filter((item) => (item.category || '').trim().toLowerCase() === activeCategory)
  }
  return base
}

// Auth actions
btnSignup.addEventListener('click', async () => {
  authMsg.textContent = ''
  const fullName = nameEl?.value.trim() || ''
  if (!fullName) {
    authMsg.textContent = 'Please enter your name.'
    return
  }
  try {
    const { error } = await db.auth.signUp({
      email: emailEl.value,
      password: passwordEl.value,
      options: { data: { full_name: fullName } }
    })
    if (error) throw error
    const { data: authData } = await db.auth.getUser()
    if (!authData.user) {
      authMsg.textContent = 'Account created. Please check your email and confirm your email address before logging in.'
      return
    }
    authMsg.textContent = 'Sign-up successful. You are now signed in.'
    await handleAuthChange()
  } catch (err) {
    authMsg.textContent = err.message
  }
})

btnLogin.addEventListener('click', async () => {
  authMsg.textContent = ''
  try {
    const { error } = await db.auth.signInWithPassword({ email: emailEl.value, password: passwordEl.value })
    if (error) throw error
    authMsg.textContent = 'Login successful.'
    await handleAuthChange()
  } catch (err) {
    authMsg.textContent = err.message
  }
})

function enterEditMode() {
  if (formEyebrow) formEyebrow.textContent = 'Editing Listing'
  if (formHeading) formHeading.textContent = 'Update your listing'
  if (editModeBadge) editModeBadge.style.display = 'inline-flex'
  if (createListingSection) createListingSection.classList.add('create-listing-editing')
  if (createListingBtn) createListingBtn.textContent = 'Save Changes'
  if (cancelEditBtn) cancelEditBtn.style.display = ''
}

function exitEditMode() {
  editingId = null
  if (formEyebrow) formEyebrow.textContent = 'New Listing'
  if (formHeading) formHeading.textContent = 'Create a Listing'
  if (editModeBadge) editModeBadge.style.display = 'none'
  if (createListingSection) createListingSection.classList.remove('create-listing-editing')
  if (createListingBtn) createListingBtn.textContent = 'Create Listing'
  if (cancelEditBtn) cancelEditBtn.style.display = 'none'
}

function setFormCompact(compact = true) {
  if (!createListingSection) return
  createListingSection.classList.toggle('compact', compact)
  const adv = createListingSection.querySelector('.advanced-fields')
  if (adv) adv.style.display = compact ? 'none' : ''
  if (toggleMoreBtn) toggleMoreBtn.textContent = compact ? 'More options' : 'Less options'
}

// Toggle advanced fields
toggleMoreBtn?.addEventListener('click', () => {
  if (!createListingSection) return
  const compact = createListingSection.classList.toggle('compact')
  const adv = createListingSection.querySelector('.advanced-fields')
  if (adv) adv.style.display = compact ? 'none' : ''
  if (toggleMoreBtn) toggleMoreBtn.textContent = compact ? 'More options' : 'Less options'
})

function getDisplayNameFromEmail(email) {
  const localPart = String(email).split('@')[0] || ''
  const words = localPart.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  if (!words.length) return email
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
}

function openAccountSettings() {
  if (!currentUser) return
  accountName.value = currentUser.user_metadata?.full_name || getDisplayNameFromEmail(currentUser.email)
  accountEmail.value = currentUser.email || ''
  accountPassword.value = ''
  accountPasswordConfirm.value = ''
  accountMsg.textContent = ''
  accountOverlay.classList.remove('hidden')
  accountOverlay.setAttribute('aria-hidden', 'false')
  document.body.classList.add('lightbox-open')
}

function closeAccountSettings() {
  accountOverlay.classList.add('hidden')
  accountOverlay.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('lightbox-open')
}

async function saveAccountSettings(event) {
  event.preventDefault()
  if (!currentUser) return
  accountMsg.textContent = ''
  const fullName = accountName.value.trim()
  const email = accountEmail.value.trim()
  const password = accountPassword.value
  const passwordConfirm = accountPasswordConfirm.value
  if (!fullName) { accountMsg.textContent = 'Please enter your name.'; return }
  if (!email) { accountMsg.textContent = 'Please enter your email address.'; return }
  if ((password || passwordConfirm) && password !== passwordConfirm) {
    accountMsg.textContent = 'The new passwords do not match.'
    return
  }
  if (password && password.length < 6) {
    accountMsg.textContent = 'Your new password must be at least 6 characters.'
    return
  }
  try {
    const attributes = { email, data: { full_name: fullName } }
    if (password) attributes.password = password
    const { error } = await db.auth.updateUser(attributes)
    if (error) throw error
    const emailChanged = email.toLowerCase() !== String(currentUser.email || '').toLowerCase()
    accountMsg.textContent = emailChanged
      ? 'Your details were saved. Please check your email to confirm the new address.'
      : 'Your account details were saved.'
    await db.auth.getUser()
    await handleAuthChange()
  } catch (err) {
    accountMsg.textContent = err?.message || 'We could not update your account.'
  }
}

async function deleteAccount() {
  if (!currentUser) return
  const confirmed = window.confirm('Delete your account and all of your listings? This cannot be undone.')
  if (!confirmed) return
  accountMsg.textContent = 'Deleting your account…'
  try {
    let error = null
    if (useSupabase) {
      const result = await db.rpc('delete_my_account')
      error = result.error
    } else {
      const result = await db.auth.deleteUser()
      error = result.error
    }
    if (error) throw error
    await db.auth.signOut()
    closeAccountSettings()
    authMsg.textContent = 'Your account has been deleted.'
    await handleAuthChange()
  } catch (err) {
    accountMsg.textContent = err?.message || 'We could not delete your account.'
  }
}

accountClose?.addEventListener('click', closeAccountSettings)
accountCancel?.addEventListener('click', closeAccountSettings)
accountOverlay?.addEventListener('click', (event) => {
  if (event.target === accountOverlay) closeAccountSettings()
})
accountForm?.addEventListener('submit', saveAccountSettings)
accountDelete?.addEventListener('click', deleteAccount)

async function handleAuthChange() {
  const { data } = await db.auth.getUser()
  const user = data.user
  currentUser = user
  loadFavoritesForCurrentUser()
  if (user) {
    const rawDisplayName = user.user_metadata?.full_name || getDisplayNameFromEmail(user.email)
    const displayName = rawDisplayName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ')
    authArea.innerHTML = `<div class="auth-pill-group"><span class="auth-pill">Welcome, ${escapeHtml(displayName)}</span><button id="btn-my-listings" class="auth-pill auth-my-listings" type="button">My Listings</button><button id="btn-logout" class="auth-pill auth-logout" type="button">Logout</button></div>`
    authSection.style.display = 'none'
    createListingSection.style.display = ''
    // Keep the form compact by default and allow expanding via More options
    setFormCompact(true)
    document.getElementById('btn-logout').addEventListener('click', async () => {
      await db.auth.signOut()
      authMsg.textContent = 'Logged out.'
      await handleAuthChange()
    })
    document.getElementById('btn-my-listings').addEventListener('click', openMyListings)
    accountCorner?.classList.remove('hidden')
    if (!document.body.classList.contains('app-ready')) {
      accountCorner?.classList.add('auth-loading-hidden')
    } else {
      accountCorner?.classList.remove('auth-loading-hidden')
    }
    if (accountCorner && !accountCorner.dataset.bound) {
      accountCorner.addEventListener('click', openAccountSettings)
      accountCorner.dataset.bound = '1'
    }
  } else {
    authArea.innerHTML = ''
    accountCorner?.classList.add('hidden')
    accountCorner?.classList.remove('auth-loading-hidden')
    authSection.style.display = ''
    createListingSection.style.display = 'none'
  }
  // Re-render listings so owner-only actions update visibility
  await fetchAndRenderListings()
}

const togglePasswordBtn = document.getElementById('toggle-password')
togglePasswordBtn.addEventListener('click', () => {
  const type = passwordEl.type === 'password' ? 'text' : 'password'
  passwordEl.type = type
  togglePasswordBtn.classList.toggle('visible', type === 'text')
  togglePasswordBtn.setAttribute('aria-label', type === 'password' ? 'Show password' : 'Hide password')
})

// Create listing w/ optional image upload
// Compresses/resizes an image file in the browser before upload —
// caps the longest side at 1280px and re-encodes as JPEG at 0.75 quality.
// Falls back to the original file if anything goes wrong (old browsers, SVGs, etc).
async function compressImage(file, maxDimension = 1280, quality = 0.75) {
  if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/svg+xml') return file
  try {
    const bitmap = await createImageBitmap(file)
    let { width, height } = bitmap
    if (width <= maxDimension && height <= maxDimension && file.size < 400 * 1024) {
      bitmap.close?.()
      return file // already small enough, don't bother
    }
    const scale = Math.min(1, maxDimension / Math.max(width, height))
    const targetW = Math.round(width * scale)
    const targetH = Math.round(height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file
    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch (e) {
    console.warn('Image compression failed, using original file', e)
    return file
  }
}

createListingBtn.addEventListener('click', async () => {
  listingMsg.textContent = ''
  try {
    // Get the signed-in user first — the storage policies require uploads to
    // live under "<user_id>/filename", so the path needs the id up front.
    const currentUser = (await db.auth.getUser()).data.user

    let image_url = null
    let image_urls = []
    const existingListing = editingId
      ? (currentListings.find((item) => item.id === editingId) || localState.listings.find((item) => item.id === editingId))
      : null
    if (editingId && existingListing) image_urls = getListingImages(existingListing)

    const selectedFiles = imageEl.files ? [...imageEl.files] : []
    if (selectedFiles.length > 3) {
      return showFormError('Please choose no more than 3 pictures.', imageEl)
    }

    // When editing, choosing new pictures replaces the old gallery.
    // This keeps every listing capped at a maximum of 3 pictures.
    if (selectedFiles.length) image_urls = []

    if (selectedFiles.length) {
      listingMsg.textContent = `Optimizing ${selectedFiles.length} image${selectedFiles.length === 1 ? '' : 's'}…`
      for (let i = 0; i < selectedFiles.length; i++) {
        const compressed = await compressImage(selectedFiles[i])
        const path = `${currentUser?.id || 'anon'}/${Date.now()}_${i}_${compressed.name}`
        let uploadedUrl = null
        try {
          if (useSupabase && db.storage) {
            const storage = db.storage.from('listing-images')
            const { data: upData, error: upErr } = await storage.upload(path, compressed, { upsert: false })
            if (!upErr) {
              const { data: pub } = storage.getPublicUrl(upData?.path || upData?.Key || path)
              uploadedUrl = pub?.publicUrl || null
            }
          }
        } catch (e) {
          console.warn('Supabase storage upload failed, using local fallback', e)
        }
        if (!uploadedUrl) {
          localImageStore[path] = compressed
          uploadedUrl = URL.createObjectURL(compressed)
        }
        if (isValidImageUrl(uploadedUrl)) image_urls.push(uploadedUrl)
      }
      listingMsg.textContent = ''
    }

    if (!image_urls.length && existingListing) image_urls = getListingImages(existingListing)
    image_url = image_urls[0] || null

    const obj = {
      title: titleEl.value.trim(),
      price: priceEl.value.trim(),
      price_currency: priceCurrencyEl?.value || null,
      payment_type: paymentTypeEl.value,
      delivery_type: deliveryTypeEl.value,
      url: urlEl.value.trim(),
      category: categoryEl.value.trim(),
      contact_method: contactMethodEl.value.trim(),
      contact_details: contactDetailsEl.value.trim(),
      description: descEl.value.trim(),
      image_url,
      image_urls,
      location: formatLocation(locationEl?.value),
      user_id: currentUser?.id || null,
      sold: existingListing?.sold || false
    }

    if (!obj.title) return showFormError('Please enter a title for your listing.', titleEl)
    if (!obj.price) return showFormError('Please enter a price for your listing.', priceEl)
    if (!obj.category) return showFormError('Please choose a category for your listing.', categoryEl)
    if (obj.contact_method && !obj.contact_details) return showFormError('Please enter your contact details so buyers can reach you.', contactDetailsEl)
    if (obj.contact_details && !obj.contact_method) return showFormError('Please choose how buyers can contact you.', contactMethodEl)

    // If contact fields are empty, omit them so inserts against differing schemas don't fail.
    if (!obj.payment_type) delete obj.payment_type
    if (!obj.delivery_type) delete obj.delivery_type
    if (!obj.contact_method) delete obj.contact_method
    if (!obj.contact_details) delete obj.contact_details

    // Attempt insert; strip whichever column Postgres/PostgREST reports as
    // missing and retry, looping in case more than one column is absent.
    async function tryInsert(row) {
      const attempt = { ...row }
      let res = await db.from('listings').insert([attempt])
      const patterns = [ /column \"([^\"]+)\" does not exist/gi, /Could not find the '([^']+)' column/gi ]

      while (res.error && typeof res.error.message === 'string') {
        const msg = res.error.message
        let removed = false
        for (const p of patterns) {
          let m
          while ((m = p.exec(msg)) !== null) {
            const col = m[1]
            if (col in attempt) {
              delete attempt[col]
              removed = true
            }
          }
        }
        if (!removed) break
        res = await db.from('listings').insert([attempt])
      }

      // Final fallback: if it's still failing for some other reason and
      // contact fields are present, try once more without them.
      if (res.error && ('contact_method' in attempt || 'contact_details' in attempt)) {
        delete attempt.contact_method
        delete attempt.contact_details
        res = await db.from('listings').insert([attempt])
      }

      return res
    }

    // If editing, perform update flow instead of insert
    if (editingId) {
      const updateObj = { ...obj }
      delete updateObj.sold
      if (!updateObj.contact_method) delete updateObj.contact_method
      if (!updateObj.contact_details) delete updateObj.contact_details

      if (useSupabase) {
        const { error: upErr } = await db.from('listings').update(updateObj).eq('id', editingId)
        if (upErr) throw upErr
      } else {
        const idx = localState.listings.findIndex((r) => r.id === editingId)
        if (idx !== -1) {
          localState.listings[idx] = { ...localState.listings[idx], ...updateObj }
          persistLocalState()
        }
      }

      listingMsg.textContent = 'Listing updated successfully.'
      exitEditMode()
      titleEl.value = ''
      priceEl.value = ''
      if (priceCurrencyEl) priceCurrencyEl.value = 'ZAR'
      paymentTypeEl.value = ''
      urlEl.value = ''
      categoryEl.value = ''
      if (locationEl) locationEl.value = ''
      descEl.value = ''
      contactMethodEl.value = ''
      contactDetailsEl.value = ''
      imageEl.value = ''
      await fetchAndRenderListings()
    } else {
      const { error } = await tryInsert(obj)
      if (error) throw error

      listingMsg.textContent = 'Listing created successfully.'
      titleEl.value = ''
      priceEl.value = ''
      if (priceCurrencyEl) priceCurrencyEl.value = 'ZAR'
        paymentTypeEl.value = ''
        deliveryTypeEl.value = ''
      urlEl.value = ''
      categoryEl.value = ''
      if (locationEl) locationEl.value = ''
      descEl.value = ''
      contactMethodEl.value = ''
      contactDetailsEl.value = ''
      imageEl.value = ''
      await fetchAndRenderListings()
    }
  } catch (err) {
    listingMsg.textContent = err.message
  }
})

// Cancel edit handler
if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', () => {
    exitEditMode()
    listingMsg.textContent = ''
    titleEl.value = ''
    priceEl.value = ''
    if (priceCurrencyEl) priceCurrencyEl.value = 'ZAR'
    paymentTypeEl.value = ''
    deliveryTypeEl.value = ''
    urlEl.value = ''
    categoryEl.value = ''
    if (locationEl) locationEl.value = ''
    descEl.value = ''
    contactMethodEl.value = ''
    contactDetailsEl.value = ''
    imageEl.value = ''
  })
}

// Delegate edit/delete button clicks inside any listing grid (main feed or My Listings overlay)
document.body.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button')
  if (!btn) return
  const id = btn.dataset && btn.dataset.id
  if (!id) return
  if (btn.classList.contains('delete-btn')) {
    if (!currentUser) return alert('You must be signed in to delete listings.')
    if (!confirm('Delete this listing? This cannot be undone.')) return
    try {
      if (useSupabase) {
        const { error } = await db.from('listings').delete().eq('id', id)
        if (error) throw error
      } else {
        localState.listings = localState.listings.filter((r) => r.id !== id)
        persistLocalState()
      }
      await fetchAndRenderListings()
    } catch (e) {
      alert(e.message || 'Failed to delete listing')
    }
  }
  if (btn.classList.contains('edit-btn')) {
    const item = currentListings.find((r) => r.id === id) || localState.listings.find((r) => r.id === id)
    if (!item) return
    if (!currentUser || item.user_id !== currentUser.id) return alert('You can only edit your own listings.')
    editingId = id
    titleEl.value = item.title || ''
      priceEl.value = item.price || ''
      if (priceCurrencyEl) priceCurrencyEl.value = item.price_currency || item.currency || 'ZAR'
    paymentTypeEl.value = item.payment_type || ''
    deliveryTypeEl.value = item.delivery_type || ''
    urlEl.value = item.url || ''
    categoryEl.value = item.category || ''
    if (locationEl) locationEl.value = item.location || item.city || ''
    contactMethodEl.value = item.contact_method || ''
    contactDetailsEl.value = item.contact_details || ''
    descEl.value = item.description || ''
    imageEl.value = ''
    closeMyListings()
    enterEditMode()
    window.scrollTo({ top: createListingSection.offsetTop - 20, behavior: 'smooth' })
  }
  if (btn.classList.contains('sold-btn')) {
    if (!currentUser) return alert('You must be signed in to update listings.')
    const nowSold = btn.dataset.sold !== '1' // toggling to the opposite of current state
    try {
      if (useSupabase) {
        const { error } = await db.from('listings').update({ sold: nowSold }).eq('id', id)
        if (error) throw error
      } else {
        const idx = localState.listings.findIndex((r) => r.id === id)
        if (idx !== -1) { localState.listings[idx].sold = nowSold; persistLocalState() }
      }
      await fetchAndRenderListings()
    } catch (e) {
      alert(e.message || 'Failed to update listing')
    }
  }
  if (btn.classList.contains('favorite-btn')) {
    if (!currentUser) return alert('Please sign in to save favorites.')
    if (favoritedIds.has(id)) favoritedIds.delete(id)
    else favoritedIds.add(id)
    persistFavorites()
    btn.classList.toggle('active')
    btn.textContent = favoritedIds.has(id) ? '★ Saved' : '☆ Save'
  }
  if (btn.classList.contains('offer-btn')) {
    if (!currentUser) return alert('Please sign in to make an offer.')
    const item = currentListings.find((r) => r.id === id)
    const amount = prompt(`Your offer for "${item ? item.title : 'this listing'}"?`)
    if (!amount || !amount.trim()) return
    const numAmount = Number(amount.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(numAmount) || numAmount <= 0) return alert('Please enter a valid amount.')
    try {
      if (useSupabase) {
        const { error } = await db.from('offers').insert([{
          listing_id: id,
          buyer_id: currentUser.id,
          seller_id: item?.user_id || null,
          amount: numAmount,
        }])
        if (error) throw error
      }
      alert('Offer sent! The seller will see it and can reach out to you.')
    } catch (e) {
      console.warn('Offer insert failed:', e)
      alert("Couldn't send your offer right now. Please try again later.")
    }
  }
  if (btn.classList.contains('confirm-available-btn')) {
    if (!currentUser) return
    try {
      if (useSupabase) {
        const { error } = await db.from('listings').update({ last_confirmed_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      }
      await fetchAndRenderListings()
    } catch (e) {
      alert('Could not update the listing right now.')
    }
  }
  if (btn.classList.contains('share-btn')) {
    const item = currentListings.find((r) => r.id === id)
    const shareText = item ? `Check out "${item.title}" on LinkHub` : 'Check out this listing on LinkHub'
    const shareUrl = `${window.location.origin}${window.location.pathname}?listing=${encodeURIComponent(id)}`
    if (navigator.share) {
      navigator.share({ title: 'LinkHub', text: shareText, url: shareUrl }).catch(() => {})
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(`${shareText} — ${shareUrl}`)
      alert('Link copied to clipboard!')
    }
  }
  if (btn.classList.contains('report-btn')) {
    if (!currentUser) return alert('Please sign in before reporting a listing.')
    const reason = prompt('Why are you reporting this listing? (e.g. scam, wrong category, inappropriate)')
    if (!reason) return
    try {
      if (useSupabase) {
        await db.from('reports').insert([{ listing_id: id, reporter_id: currentUser?.id || null, reason }])
      }
    } catch (e) {
      console.warn('Report insert failed (table may not exist yet):', e)
    }
    alert("Thanks, we'll look into it.")
  }
})

document.addEventListener('DOMContentLoaded', () => {
  const loadingScreen = document.getElementById('loading-screen')
  setTimeout(() => {
    loadingScreen.classList.add('hidden')
    document.body.classList.add('app-ready')
    if (currentUser && accountCorner) {
      accountCorner.classList.remove('hidden', 'auth-loading-hidden')
    }
  }, 1100)
  // Ensure the listing form starts compact and toggle text is correct
  try {
    setFormCompact(true)
  } catch (e) {}
})

// My Listings: dedicated overlay showing only the signed-in user's own posts
const myListingsOverlay = document.getElementById('my-listings-overlay')
const myListingsClose = document.getElementById('my-listings-close')
const myListingsGrid = document.getElementById('my-listings-grid')
const myListingsCount = document.getElementById('my-listings-count')

function renderMyListings() {
  if (!myListingsGrid) return
  myListingsGrid.innerHTML = ''
  if (!currentUser) return
  const mine = currentListings.filter((item) => item.user_id === currentUser.id)
  if (myListingsCount) myListingsCount.textContent = `${mine.length} listing${mine.length === 1 ? '' : 's'}`
  if (!mine.length) {
    myListingsGrid.innerHTML = '<div class="muted">You haven\'t posted anything yet. Create a listing above to see it here.</div>'
    return
  }
  mine.forEach((item) => renderListing(item, myListingsGrid))
}

function openMyListings() {
  if (!myListingsOverlay) return
  renderMyListings()
  myListingsOverlay.classList.remove('hidden')
  myListingsOverlay.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
}

function closeMyListings() {
  if (!myListingsOverlay) return
  myListingsOverlay.classList.add('hidden')
  myListingsOverlay.setAttribute('aria-hidden', 'true')
  document.documentElement.classList.remove('lightbox-open')
}

myListingsClose?.addEventListener('click', closeMyListings)
myListingsOverlay?.addEventListener('click', (ev) => {
  if (ev.target === myListingsOverlay) closeMyListings()
})
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeMyListings()
})

// Image preview lightbox
const lightbox = document.getElementById('image-lightbox')
const lightboxImg = document.getElementById('lightbox-img')
const lightboxCloseBtn = document.getElementById('lightbox-close')

function openLightbox(src) {
  if (!src) return
  lightboxImg.src = src
  lightbox.classList.remove('hidden')
  lightbox.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
}

function closeLightbox() {
  lightbox.classList.add('hidden')
  lightbox.setAttribute('aria-hidden', 'true')
  document.documentElement.classList.remove('lightbox-open')
  lightboxImg.src = ''
}

lightboxCloseBtn.addEventListener('click', closeLightbox)
lightbox.addEventListener('click', (ev) => {
  if (ev.target === lightbox) closeLightbox()
})
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeLightbox()
})

document.body.addEventListener('click', (ev) => {
  const wrap = ev.target.closest('.listing-img-wrap')
  if (!wrap) return
  const img = wrap.querySelector('img')
  if (img) openLightbox(img.src)
})

searchEl?.addEventListener('input', () => renderFilteredListings())

handleAuthChange()

// Fetch listings
function renderSkeletons(count = 6) {
  listingsContainer.innerHTML = Array.from({ length: count })
    .map(() => '<div class="listing listing-skeleton"><div class="skeleton-img"></div><div class="skeleton-line" style="width:80%"></div><div class="skeleton-line" style="width:40%"></div><div class="skeleton-line" style="width:60%"></div></div>')
    .join('')
}

async function fetchAndRenderListings() {
  renderSkeletons()
  try {
    // Select all columns to avoid errors if remote schema differs.
    const { data, error } = await db.from('listings').select('*')
    if (error) throw error
    currentListings = data || []
    renderCategoryChips()
    renderFilteredListings()
    if (myListingsOverlay && !myListingsOverlay.classList.contains('hidden')) renderMyListings()
  } catch (err) {
    const cached = loadStoredJSON('linkhub-last-listings', [])
    if (Array.isArray(cached) && cached.length) {
      currentListings = cached
      renderCategoryChips()
      renderFilteredListings()
      listingsContainer.insertAdjacentHTML('afterbegin', '<div class="offline-note">Showing your latest saved listings. Reconnect to refresh.</div>')
    } else {
      listingsContainer.innerHTML = '<div class="muted">We couldn’t load the listings right now. Please check your connection and try again.</div>'
    }
  }
}

function renderCategoryChips() {
  if (!categoryChipsEl) return
  const seen = new Map() // normalized key -> display label (first-seen casing)
  for (const item of currentListings) {
    const raw = (item.category || '').trim()
    if (!raw) continue
    const key = raw.toLowerCase()
    if (!seen.has(key)) seen.set(key, raw)
  }
  const categories = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  if (!categories.length) {
    categoryChipsEl.innerHTML = ''
    activeCategory = ''
    return
  }
  if (activeCategory && !categories.some(([key]) => key === activeCategory)) activeCategory = ''
  const chips = ['<button type="button" class="category-chip' + (activeCategory === '' ? ' active' : '') + '" data-category="">All</button>']
  for (const [key, label] of categories) {
    chips.push(`<button type="button" class="category-chip${activeCategory === key ? ' active' : ''}" data-category="${escapeHtml(key)}">${escapeHtml(label)}</button>`)
  }
  categoryChipsEl.innerHTML = chips.join('')
}

categoryChipsEl?.addEventListener('click', (ev) => {
  const chip = ev.target.closest('.category-chip')
  if (!chip) return
  activeCategory = chip.dataset.category || ''
  renderCategoryChips()
  renderFilteredListings()
})

function renderFilteredListings() {
  const term = searchEl?.value.trim().toLowerCase() || ''
  const scoped = getScopedListings()
  const filtered = sortListings(scoped.filter((item) => {
    if (!term) return true
    const text = [item.title, item.price, item.price_currency, item.currency, item.payment_type, item.delivery_type, item.category, item.description, item.contact_method, item.contact_details, item.url, item.location, item.city]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return text.includes(term)
  }))
  listCount.textContent = `${filtered.length} listing${filtered.length === 1 ? '' : 's'}`
  listingsContainer.innerHTML = ''
  if (!filtered.length) {
    const message = currentListings.length === 0
      ? 'No listings yet — be the first to post something!'
      : 'No listings match your search.'
    listingsContainer.innerHTML = `<div class="muted">${message}</div>`
    return 0
  }
  const page = filtered.slice(0, visibleCount)
  page.forEach((item) => renderListing(item, listingsContainer))
  if (filtered.length > page.length) {
    const more = document.createElement('button')
    more.type = 'button'
    more.className = 'load-more-btn full-width'
    more.textContent = `Load more (${filtered.length - page.length} remaining)`
    more.addEventListener('click', () => { visibleCount += PAGE_SIZE; renderFilteredListings() })
    listingsContainer.appendChild(more)
  }
  openLinkedListingFromUrl()
  return filtered.length
}

// Deep-linkable listings: ?listing=<id> in the URL scrolls to and highlights
// that specific card, so Share links actually take people to the right item.
function openLinkedListingFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const targetId = params.get('listing')
  if (!targetId) return
  const card = listingsContainer.querySelector(`[data-listing-id="${CSS.escape(targetId)}"]`)
  if (!card) return
  card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  card.classList.add('listing-highlight')
  setTimeout(() => card.classList.remove('listing-highlight'), 2600)
}

// Apply AI-parsed filters to an already-loaded array of listings.
// Note: the "Condition" field in the form is stored in the `url` column
// (see index.html — the input labeled Condition has id="url"), so the
// condition filter is matched against item.url, not a "condition" column.
function itemMatchesFilters(item, filters, relax = {}) {
  if (!relax.category && filters.category) {
    const cat = (item.category || '').toLowerCase()
    if (!cat.includes(filters.category.toLowerCase())) return false
  }
  if (!relax.price) {
    if (filters.min_price != null) {
      const p = Number(item.price)
      if (!Number.isFinite(p) || p < filters.min_price) return false
    }
    if (filters.max_price != null) {
      const p = Number(item.price)
      if (!Number.isFinite(p) || p > filters.max_price) return false
    }
  }
  if (!relax.condition && filters.condition) {
    const cond = (item.url || '').toLowerCase()
    if (!cond.includes(filters.condition.toLowerCase())) return false
  }
  if (!relax.delivery && filters.delivery) {
    const del = (item.delivery_type || '').toLowerCase()
    if (!del.includes(filters.delivery.toLowerCase())) return false
  }
  if (filters.keywords && filters.keywords.length) {
    const haystack = [item.title, item.description, item.category, item.url, item.contact_method, item.location, item.city]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    const matchesAny = filters.keywords.some((k) => haystack.includes(String(k).toLowerCase()))
    if (!matchesAny) return false
  }
  return true
}

// Try the filters as given, then progressively drop the ones most likely to
// be an AI mis-guess (category first, then condition, delivery, price),
// keeping keyword matching until the very end since that's most tied to
// what the person actually typed.
function applyAiFilters(items, filters) {
  const relaxSteps = [
    {},
    { category: true },
    { category: true, condition: true },
    { category: true, condition: true, delivery: true },
    { category: true, condition: true, delivery: true, price: true },
  ]
  for (const relax of relaxSteps) {
    const results = items.filter((item) => itemMatchesFilters(item, filters, relax))
    if (results.length) return results
  }
  return []
}

const CARTY_STOPWORDS = new Set([
  'am', 'i', 'im', 'a', 'an', 'the', 'to', 'for', 'is', 'are', 'in', 'on', 'of', 'and',
  'with', 'my', 'me', 'you', 'your', 'please', 'pls', 'some', 'any', 'get', 'buy', 'buying',
  'want', 'wanna', 'need', 'looking', 'searching', 'search', 'find', 'finding', 'this', 'that',
  'there', 'anyone', 'selling', 'sell', 'do', 'have', 'has',
])

function meaningfulWords(term) {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !CARTY_STOPWORDS.has(w))
}

// Last-resort search: match individual meaningful words from the raw query
// against listings, instead of requiring the whole sentence as one substring.
function smartKeywordSearch(term) {
  const base = getScopedListings()
  const words = meaningfulWords(term)
  if (!words.length) return base

  return base.filter((item) => {
    const haystack = [item.title, item.description, item.category, item.url, item.contact_method, item.location, item.city]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return words.some((w) => haystack.includes(w))
  })
}

// Picks a short, natural phrase to reference in Carty's replies —
// prefers what the AI extracted as keywords, falls back to the
// meaningful words typed, falls back to the raw text.
function pickDisplayTerm(rawTerm, filters) {
  if (filters?.keywords?.length) return filters.keywords.slice(0, 2).join(' ')
  const words = meaningfulWords(rawTerm)
  if (words.length) return words.slice(0, 3).join(' ')
  return rawTerm
}

// Runs a Carty query. Returns either:
//   { type: 'chat', reply }                       — general conversation, no listings touched
//   { type: 'search', count, displayTerm }         — a product search, listings re-rendered
async function runAiSearch(queryText) {
  const term = queryText.trim()
  if (!term) return { type: 'search', count: 0, displayTerm: '' }

  let filters = null
  try {
    const res = await fetch(AI_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ query: term })
    })
    if (!res.ok) throw new Error(`AI search failed (${res.status})`)

    const data = await res.json()

    if (data.type === 'chat') {
      return { type: 'chat', reply: data.reply || "Hey! What are you looking for?" }
    }

    filters = data.filters || data
  } catch (err) {
    console.warn('AI search request failed, falling back to keyword matching:', err)
  }

  let results = filters ? applyAiFilters(getScopedListings(), filters) : []
  if (!results.length) {
    results = smartKeywordSearch(term)
  }

  const displayTerm = pickDisplayTerm(term, filters)

  listingsContainer.innerHTML = ''
  if (!results.length) {
    listCount.textContent = '0 listings'
    return { type: 'search', count: 0, displayTerm }
  }

  listCount.textContent = `${results.length} listing${results.length === 1 ? '' : 's'}`
  results.forEach((item) => renderListing(item, listingsContainer))
  return { type: 'search', count: results.length, displayTerm }
}

function renderListing(l, container = listingsContainer) {
  if (!(container instanceof Element)) container = listingsContainer
  if (!container) return

  const d = document.createElement('div')
  d.className = 'listing' + (l.sold ? ' listing-sold' : '')
  d.dataset.listingId = l.id
  const parts = []
  if (l.sold) parts.push('<div class="sold-badge">SOLD</div>')

  const images = getListingImages(l).filter(isValidImageUrl)
  if (images.length) {
    const safeMain = escapeHtml(images[0])
    const thumbs = images.length > 1
      ? `<div class="listing-gallery-thumbs">${images.map((src, i) => `<button type="button" class="gallery-thumb${i === 0 ? ' active' : ''}" data-gallery-id="${escapeHtml(l.id)}" data-gallery-index="${i}" aria-label="View image ${i + 1}"><img src="${escapeHtml(src)}" alt="" loading="lazy"></button>`).join('')}</div>`
      : ''
    parts.push(`<div class="listing-gallery"><button type="button" class="listing-img-wrap gallery-main-btn" data-gallery-id="${escapeHtml(l.id)}" data-gallery-index="0" aria-label="Open image preview"><img class="gallery-main-image" src="${safeMain}" alt="${escapeHtml(l.title || 'Listing image')}" loading="lazy">${images.length > 1 ? `<span class="image-count-badge">${images.length} photos</span>` : ''}</button>${thumbs}</div>`)
  }

  parts.push(`<h3 class="listing-title">${escapeHtml(l.title)}</h3>`)
  if (l.price) {
    try {
      const num = Number(l.price)
      const formatted = Number.isFinite(num) ? num.toFixed(2) : String(l.price)
      const currencyCode = (l.price_currency || l.currency || '').toString().toUpperCase()
      const symbolMap = { ZAR: 'R', USD: '$' }
      const sym = symbolMap[currencyCode] || (l.price_currency || l.currency || '')
      const display = sym ? `${sym}${formatted}` : formatted
      parts.push(`<div class="listing-price">${escapeHtml(display)}</div>`)
    } catch (e) {
      parts.push(`<div class="listing-price">${escapeHtml(l.price)}</div>`)
    }
  }
  const meta = []
  if (l.payment_type) meta.push(`<div><strong>Payment:</strong> ${escapeHtml(l.payment_type)}</div>`)
  if (l.delivery_type) meta.push(`<div><strong>Delivery:</strong> ${escapeHtml(l.delivery_type)}</div>`)
  if (l.location || l.city) meta.push(`<div><strong>Location:</strong> ${escapeHtml(l.location || l.city)}</div>`)
  if (l.category) meta.push(`<div><strong>Category:</strong> ${escapeHtml(l.category)}</div>`)
  if (l.url) meta.push(`<div><strong>Condition:</strong> ${escapeHtml(l.url)}</div>`)
  if (l.contact_method || l.contact_details) {
    const method = l.contact_method ? escapeHtml(l.contact_method) : ''
    const details = l.contact_details ? `<strong>${escapeHtml(l.contact_details)}</strong>` : ''
    const wa = String(l.contact_method || '').toLowerCase() === 'whatsapp' ? buildWhatsAppUrl(l.contact_details) : null
    const contactHtml = wa ? `<a class="whatsapp-link" href="${escapeHtml(wa)}" target="_blank" rel="noopener">WhatsApp ${details}</a>` : `${method} ${details}`
    meta.push(`<div><strong>Contact:</strong> ${contactHtml}</div>`)
  }
  if (meta.length) parts.push(`<div class="listing-meta">${meta.join('\n')}</div>`)
  if (l.description) parts.push(`<p class="listing-desc">${escapeHtml(l.description)}</p>`)
  if (l.created_at) {
    try {
      const when = new Date(l.created_at).toLocaleString()
      parts.push(`<div class="muted listing-posted">Posted: ${escapeHtml(when)}</div>`)
    } catch (e) {
      parts.push(`<div class="muted listing-posted">Posted: ${escapeHtml(l.created_at)}</div>`)
    }
  }

  const isOwner = currentUser && l.user_id && l.user_id === currentUser.id
  const isFavorited = favoritedIds.has(l.id)
  if (isOwner) {
    parts.push(`<div class="listing-actions" style="margin-top:10px">
      <button class="edit-btn" data-id="${escapeHtml(l.id)}" type="button">Edit</button>
      <button class="sold-btn" data-id="${escapeHtml(l.id)}" data-sold="${l.sold ? '1' : '0'}" type="button">${l.sold ? 'Mark Available' : 'Mark Sold'}</button>
      <button class="delete-btn" data-id="${escapeHtml(l.id)}" type="button">Delete</button>
    </div>`)
    parts.push(`<div class="listing-actions listing-owner-extra" style="margin-top:6px">
      <button class="share-btn" data-id="${escapeHtml(l.id)}" type="button">Share</button>
    </div>`)
  } else {
    parts.push(`<div class="listing-actions" style="margin-top:10px">
      <button class="favorite-btn${isFavorited ? ' active' : ''}" data-id="${escapeHtml(l.id)}" type="button">${isFavorited ? '★ Saved' : '☆ Save'}</button>
      <button class="offer-btn" data-id="${escapeHtml(l.id)}" type="button">Make Offer</button>
      <button class="share-btn" data-id="${escapeHtml(l.id)}" type="button">Share</button>
      <button class="report-btn" data-id="${escapeHtml(l.id)}" type="button">Report</button>
    </div>`)
  }

  if (!isOwner) {
    parts.push(`<div class="listing-views muted" data-view-id="${escapeHtml(l.id)}">${Number(l.view_count) > 0 ? `${Number(l.view_count)} views` : 'Viewed by buyers'}</div>`)
  } else {
    parts.push(`<div class="listing-views muted" data-view-id="${escapeHtml(l.id)}">${Number(l.view_count) || 0} view${Number(l.view_count) === 1 ? '' : 's'} so far</div>`)
    const ageDays = l.created_at ? Math.floor((Date.now() - new Date(l.last_confirmed_at || l.created_at).getTime()) / 86400000) : 0
    if (!l.sold && ageDays >= 14) {
      parts.push(`<div class="stale-nudge">Posted ${ageDays} days ago — <button class="confirm-available-btn" data-id="${escapeHtml(l.id)}" type="button">Still available?</button></div>`)
    }
  }
  d.innerHTML = parts.join('\n')
  container.appendChild(d)
  trackListingView(l)
}

document.body.addEventListener('click', (ev) => {
  const mainBtn = ev.target.closest('.gallery-main-btn')
  const thumb = ev.target.closest('.gallery-thumb')
  const button = mainBtn || thumb
  if (!button) return
  const id = button.dataset.galleryId
  const index = Number(button.dataset.galleryIndex || 0)
  const item = currentListings.find((r) => String(r.id) === String(id)) || localState.listings.find((r) => String(r.id) === String(id))
  const images = item ? getListingImages(item).filter(isValidImageUrl) : []
  if (!images.length) return
  if (thumb) {
    const gallery = thumb.closest('.listing-gallery')
    const main = gallery?.querySelector('.gallery-main-image')
    if (main) main.src = images[index] || images[0]
    gallery?.querySelectorAll('.gallery-thumb').forEach((el, i) => el.classList.toggle('active', i === index))
  }
  if (mainBtn) openLightbox(images[index] || images[0])
})

async function trackListingView(item) {
  if (!item?.id || !useSupabase) return
  if (currentUser?.id && item.user_id && String(currentUser.id) === String(item.user_id)) return
  const key = `viewed-listing-${item.id}`
  if (sessionStorage.getItem(key)) return
  sessionStorage.setItem(key, '1')
  try {
    const { data } = await db.rpc('increment_listing_view', { listing_id: item.id })
    const count = Number(data)
    if (Number.isFinite(count)) document.querySelector(`[data-view-id="${CSS.escape(String(item.id))}"]`)?.replaceChildren(document.createTextNode(`${count} views`))
  } catch {
    // View counting is optional; the listing still works when the RPC is not installed yet.
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// --- Carty: AI shopping assistant popup ---
const cartyToggle = document.getElementById('carty-toggle')
const cartyPanel = document.getElementById('carty-panel')
const cartyClose = document.getElementById('carty-close')
const cartyForm = document.getElementById('carty-form')
const cartyInput = document.getElementById('carty-input')
const cartyMessage = document.getElementById('carty-message')

function openCarty() {
  if (!cartyPanel) return
  cartyPanel.classList.remove('hidden')
  cartyPanel.setAttribute('aria-hidden', 'false')
  cartyInput?.focus()
}

function closeCarty() {
  if (!cartyPanel) return
  cartyPanel.classList.add('hidden')
  cartyPanel.setAttribute('aria-hidden', 'true')
}

cartyToggle?.addEventListener('click', () => {
  if (cartyPanel?.classList.contains('hidden')) openCarty()
  else closeCarty()
})
cartyClose?.addEventListener('click', closeCarty)

cartyForm?.addEventListener('submit', async (ev) => {
  ev.preventDefault()
  const term = cartyInput.value.trim()
  if (!term) return

  if (cartyMessage) cartyMessage.textContent = 'Thinking…'
  cartyInput.disabled = true

  const result = await runAiSearch(term)

  cartyInput.disabled = false
  cartyInput.value = ''
  cartyInput.focus()

  if (!cartyMessage) return

  if (result.type === 'chat') {
    cartyMessage.textContent = result.reply
    return
  }

  if (result.count > 0) {
    cartyMessage.textContent = `Found ${result.count} listing${result.count === 1 ? '' : 's'} for "${result.displayTerm}" 🛒 Want to search for something else?`
    document.getElementById('feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else {
    cartyMessage.textContent = `There's no one selling "${result.displayTerm}" at the moment.`
  }
})

// Theme (light/dark) — applied immediately so there's no flash of the wrong theme
const themeToggleBtn = document.getElementById('theme-toggle-btn')
function applyTheme(theme) {
  document.documentElement.classList.toggle('light-theme', theme === 'light')
  if (themeToggleBtn) themeToggleBtn.textContent = theme === 'light' ? '☀️ Light' : '🌙 Dark'
}
applyTheme(localStorage.getItem('linkhub-theme') || 'dark')
themeToggleBtn?.addEventListener('click', () => {
  const next = document.documentElement.classList.contains('light-theme') ? 'dark' : 'light'
  localStorage.setItem('linkhub-theme', next)
  applyTheme(next)
})

// initial load
fetchAndRenderListings().then(openLinkedListingFromUrl)

// Register service worker for PWA install support + app-shell caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err)
    })
  })
}


let deferredInstallPrompt = null
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredInstallPrompt = event
  let button = document.getElementById('install-app-btn')
  if (!button) {
    button = document.createElement('button')
    button.id = 'install-app-btn'
    button.className = 'install-app-btn'
    button.type = 'button'
    button.textContent = 'Install LinkHub'
    document.querySelector('.page-header .brand-right')?.appendChild(button)
    button.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return
      deferredInstallPrompt.prompt()
      await deferredInstallPrompt.userChoice.catch(() => null)
      deferredInstallPrompt = null
      button.remove()
    })
  }
})
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null
  document.getElementById('install-app-btn')?.remove()
})

// Greet only the very first time this browser ever loads the site
document.addEventListener('DOMContentLoaded', () => {
  const alreadyGreeted = localStorage.getItem('carty-greeted')
  if (alreadyGreeted) return
  setTimeout(() => {
    openCarty()
    localStorage.setItem('carty-greeted', '1')
  }, 1800)
})