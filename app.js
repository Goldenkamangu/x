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
    async signUp({ email, password }) {
      const existingUser = localState.users.find((user) => user.email.toLowerCase() === email.toLowerCase())
      if (existingUser) {
        localState.session = { user: { id: existingUser.id, email: existingUser.email } }
        persistLocalState()
        return { data: { user: localState.session.user }, error: null }
      }

      const user = { id: crypto.randomUUID?.() || `${Date.now()}`, email, password }
      localState.users.push(user)
      localState.session = { user: { id: user.id, email: user.email } }
      persistLocalState()
      return { data: { user: localState.session.user }, error: null }
    },

    async signInWithPassword({ email, password }) {
      const user = localState.users.find((entry) => entry.email.toLowerCase() === email.toLowerCase() && entry.password === password)
      if (!user) {
        return { data: { user: null }, error: { message: 'Invalid email or password' } }
      }

      localState.session = { user: { id: user.id, email: user.email } }
      persistLocalState()
      return { data: { user: localState.session.user }, error: null }
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

const db = useSupabase
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : (console.warn('Supabase is not configured. Using localStorage fallback.'), localDb)

// Elements
const authArea = document.getElementById('auth-area')
const emailEl = document.getElementById('email')
const passwordEl = document.getElementById('password')
const btnSignup = document.getElementById('btn-signup')
const btnLogin = document.getElementById('btn-login')
const authMsg = document.getElementById('auth-msg')
const authSection = document.getElementById('auth-section')
const createListingSection = document.getElementById('create-listing-section')
const titleEl = document.getElementById('title')
const urlEl = document.getElementById('url')
const categoryEl = document.getElementById('category')
const contactMethodEl = document.getElementById('contact-method')
const contactDetailsEl = document.getElementById('contact-details')
const descEl = document.getElementById('description')
const imageEl = document.getElementById('image')
const createListingBtn = document.getElementById('create-listing')
const listingMsg = document.getElementById('listing-msg')
const listCount = document.getElementById('list-count')
const listingsContainer = document.getElementById('listings')
const searchEl = document.getElementById('search-input')
let currentListings = []

// Auth actions
btnSignup.addEventListener('click', async () => {
  authMsg.textContent = ''
  try {
    const { error } = await db.auth.signUp({ email: emailEl.value, password: passwordEl.value })
    if (error) throw error
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

function getDisplayNameFromEmail(email) {
  const localPart = String(email).split('@')[0] || ''
  const words = localPart.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  if (!words.length) return email
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
}

async function handleAuthChange() {
  const { data } = await db.auth.getUser()
  const user = data.user
  if (user) {
    const displayName = getDisplayNameFromEmail(user.email)
    authArea.innerHTML = `<div class="auth-pill-group"><span class="auth-pill">Welcome, ${escapeHtml(displayName)}</span><button id="btn-logout" class="auth-pill auth-logout" type="button">Logout</button></div>`
    authSection.style.display = 'none'
    createListingSection.style.display = ''
    document.getElementById('btn-logout').addEventListener('click', async () => {
      await db.auth.signOut()
      authMsg.textContent = 'Logged out.'
      await handleAuthChange()
    })
  } else {
    authArea.innerHTML = ''
    authSection.style.display = ''
    createListingSection.style.display = 'none'
  }
}

const togglePasswordBtn = document.getElementById('toggle-password')
togglePasswordBtn.addEventListener('click', () => {
  const type = passwordEl.type === 'password' ? 'text' : 'password'
  passwordEl.type = type
  togglePasswordBtn.classList.toggle('visible', type === 'text')
  togglePasswordBtn.setAttribute('aria-label', type === 'password' ? 'Show password' : 'Hide password')
})

// Create listing w/ optional image upload
createListingBtn.addEventListener('click', async () => {
  listingMsg.textContent = ''
  try {
    // Get the signed-in user first — the storage policies require uploads to
    // live under "<user_id>/filename", so the path needs the id up front.
    const currentUser = (await db.auth.getUser()).data.user

    let image_url = null
    const file = imageEl.files && imageEl.files[0]
    if (file) {
      const path = `${currentUser?.id || 'anon'}/${Date.now()}_${file.name}`
      try {
        if (useSupabase && db.storage) {
          const storage = db.storage.from('listing-images')
          const { data: upData, error: upErr } = await storage.upload(path, file)
          if (upErr) {
            console.warn('Supabase storage upload failed, falling back to local object URL', upErr)
            localImageStore[path] = file
            image_url = URL.createObjectURL(file)
          } else {
            // try to get a public URL
            try {
              const { data: pub } = await storage.getPublicUrl(upData?.path || upData?.Key || path)
              image_url = pub?.publicUrl || null
            } catch (e) {
              image_url = null
            }

            // if no public URL, attempt a signed URL (short lived)
            if (!image_url && storage.createSignedUrl) {
              try {
                const { data: signed, error: signedErr } = await storage.createSignedUrl(upData?.path || upData?.Key || path, 60)
                if (!signedErr) image_url = signed?.signedURL || image_url
              } catch (e) {
                // ignore
              }
            }

            // final fallback to object URL when remote URL can't be obtained
            if (!image_url) {
              localImageStore[path] = file
              image_url = URL.createObjectURL(file)
            }
          }
        } else {
          // Not using Supabase: keep existing local fallback behavior.
          localImageStore[path] = file
          image_url = URL.createObjectURL(file)
        }
      } catch (e) {
        console.warn('Image upload unexpected error, using local fallback', e)
        localImageStore[path] = file
        image_url = URL.createObjectURL(file)
      }
    }

    const obj = {
      title: titleEl.value.trim(),
      url: urlEl.value.trim(),
      category: categoryEl.value.trim(),
      contact_method: contactMethodEl.value.trim(),
      contact_details: contactDetailsEl.value.trim(),
      description: descEl.value.trim(),
      image_url,
      user_id: currentUser?.id || null
    }

    if (!obj.title) {
      return listingMsg.textContent = 'Please enter a title for your listing.'
    }

    // If contact fields are empty, omit them so inserts against differing schemas don't fail.
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

    const { error } = await tryInsert(obj)
    if (error) throw error

    listingMsg.textContent = 'Listing created successfully.'
    titleEl.value = ''
    urlEl.value = ''
    categoryEl.value = ''
    descEl.value = ''
    contactMethodEl.value = ''
    contactDetailsEl.value = ''
    imageEl.value = ''
    await fetchAndRenderListings()
  } catch (err) {
    listingMsg.textContent = err.message
  }
})

document.addEventListener('DOMContentLoaded', () => {
  const loadingScreen = document.getElementById('loading-screen')
  setTimeout(() => {
    loadingScreen.classList.add('hidden')
  }, 1400)
})

searchEl?.addEventListener('input', () => renderFilteredListings())

handleAuthChange()

// Fetch listings
async function fetchAndRenderListings() {
  listingsContainer.innerHTML = ''
  try {
    // Select all columns to avoid errors if remote schema differs.
    const { data, error } = await db.from('listings').select('*')
    if (error) throw error
    currentListings = data || []
    renderFilteredListings()
  } catch (err) {
    listingsContainer.innerHTML = `<div class="muted">${err.message}</div>`
  }
}

function renderFilteredListings() {
  const term = searchEl?.value.trim().toLowerCase() || ''
  const filtered = currentListings.filter((item) => {
    if (!term) return true
    const text = [item.title, item.category, item.description, item.contact_method, item.contact_details, item.url]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return text.includes(term)
  })
  listCount.textContent = `${filtered.length} listing${filtered.length === 1 ? '' : 's'}`
  listingsContainer.innerHTML = ''
  if (!filtered.length) {
    listingsContainer.innerHTML = '<div class="muted">No listings match your search.</div>'
    return
  }
  filtered.forEach(renderListing)
}

function renderListing(l) {
  const d = document.createElement('div')
  d.className = 'listing'
  const parts = []
  if (l.image_url) parts.push(`<img src="${l.image_url}" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px">`)
  parts.push(`<h3>${escapeHtml(l.title)}</h3>`)
  if (l.category) parts.push(`<div><strong>Category:</strong> ${escapeHtml(l.category)}</div>`)
  if (l.url) parts.push(`<div><strong>Condition:</strong> ${escapeHtml(l.url)}</div>`)
  if (l.contact_method || l.contact_details) {
    const method = l.contact_method ? escapeHtml(l.contact_method) : ''
    const details = l.contact_details ? `<strong>${escapeHtml(l.contact_details)}</strong>` : ''
    parts.push(`<div><strong>Contact:</strong> ${method} ${details}</div>`)
  }
  if (l.description) parts.push(`<p style="margin:8px 0">${escapeHtml(l.description)}</p>`)
  if (l.created_at) {
    try {
      const when = new Date(l.created_at).toLocaleString()
      parts.push(`<div class="muted">Posted: ${escapeHtml(when)}</div>`)
    } catch (e) {
      parts.push(`<div class="muted">Posted: ${escapeHtml(l.created_at)}</div>`)
    }
  }

  d.innerHTML = parts.join('\n')
  listingsContainer.appendChild(d)
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// initial load
fetchAndRenderListings()
