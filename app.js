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

async function handleAuthChange() {
  const { data } = await db.auth.getUser()
  const user = data.user
  currentUser = user
  if (user) {
    const displayName = user.user_metadata?.full_name || getDisplayNameFromEmail(user.email)
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
  } else {
    authArea.innerHTML = ''
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
    } else if (editingId) {
      const existingListing = currentListings.find((item) => item.id === editingId) || localState.listings.find((item) => item.id === editingId)
      image_url = existingListing?.image_url ?? null
    }

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
      user_id: currentUser?.id || null
    }

    if (!obj.title) {
      return listingMsg.textContent = 'Please enter a title for your listing.'
    }

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
    contactMethodEl.value = item.contact_method || ''
    contactDetailsEl.value = item.contact_details || ''
    descEl.value = item.description || ''
    imageEl.value = ''
    closeMyListings()
    enterEditMode()
    window.scrollTo({ top: createListingSection.offsetTop - 20, behavior: 'smooth' })
  }
})

document.addEventListener('DOMContentLoaded', () => {
  const loadingScreen = document.getElementById('loading-screen')
  setTimeout(() => {
    loadingScreen.classList.add('hidden')
  }, 1400)
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
async function fetchAndRenderListings() {
  listingsContainer.innerHTML = ''
  try {
    // Select all columns to avoid errors if remote schema differs.
    const { data, error } = await db.from('listings').select('*')
    if (error) throw error
    currentListings = data || []
    renderCategoryChips()
    renderFilteredListings()
    if (myListingsOverlay && !myListingsOverlay.classList.contains('hidden')) renderMyListings()
  } catch (err) {
    listingsContainer.innerHTML = `<div class="muted">${err.message}</div>`
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
  const filtered = scoped.filter((item) => {
    if (!term) return true
    const text = [item.title, item.price, item.price_currency, item.currency, item.payment_type, item.delivery_type, item.category, item.description, item.contact_method, item.contact_details, item.url]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return text.includes(term)
  })
  listCount.textContent = `${filtered.length} listing${filtered.length === 1 ? '' : 's'}`
  listingsContainer.innerHTML = ''
  if (!filtered.length) {
    listingsContainer.innerHTML = `<div class="muted">${showMineOnly ? "You haven't listed anything yet." : 'No listings match your search.'}</div>`
    return 0
  }
  filtered.forEach(renderListing)
  return filtered.length
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
    const haystack = [item.title, item.description, item.category, item.url, item.contact_method]
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
    const haystack = [item.title, item.description, item.category, item.url, item.contact_method]
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
  results.forEach(renderListing)
  return { type: 'search', count: results.length, displayTerm }
}

function renderListing(l, container = listingsContainer) {
  const d = document.createElement('div')
  d.className = 'listing'
  const parts = []
  if (l.image_url) parts.push(`<div class="listing-img-wrap"><img src="${l.image_url}" alt="" loading="lazy"></div>`)
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
  if (l.category) meta.push(`<div><strong>Category:</strong> ${escapeHtml(l.category)}</div>`)
  if (l.url) meta.push(`<div><strong>Condition:</strong> ${escapeHtml(l.url)}</div>`)
  if (l.contact_method || l.contact_details) {
    const method = l.contact_method ? escapeHtml(l.contact_method) : ''
    const details = l.contact_details ? `<strong>${escapeHtml(l.contact_details)}</strong>` : ''
    meta.push(`<div><strong>Contact:</strong> ${method} ${details}</div>`)
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

  // Owner-only actions
  if (currentUser && l.user_id && l.user_id === currentUser.id) {
    parts.push(`<div class="listing-actions" style="margin-top:10px"><button class="edit-btn" data-id="${escapeHtml(l.id)}" type="button">Edit</button> <button class="delete-btn" data-id="${escapeHtml(l.id)}" type="button">Delete</button></div>`)
  }

  d.innerHTML = parts.join('\n')
  container.appendChild(d)
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

// initial load
fetchAndRenderListings()

// Greet only the very first time this browser ever loads the site
document.addEventListener('DOMContentLoaded', () => {
  const alreadyGreeted = localStorage.getItem('carty-greeted')
  if (alreadyGreeted) return
  setTimeout(() => {
    openCarty()
    localStorage.setItem('carty-greeted', '1')
  }, 1800)
})
