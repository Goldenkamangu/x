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
    const displayName = getDisplayNameFromEmail(user.email)
    authArea.innerHTML = `<div class="auth-pill-group"><span class="auth-pill">Welcome, ${escapeHtml(displayName)}</span><button id="btn-logout" class="auth-pill auth-logout" type="button">Logout</button></div>`
    authSection.style.display = 'none'
    createListingSection.style.display = ''
    // Keep the form compact by default and allow expanding via More options
    setFormCompact(true)
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

// Delegate edit/delete button clicks inside listings
listingsContainer.addEventListener('click', async (ev) => {
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

listingsContainer.addEventListener('click', (ev) => {
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
  const filtered = currentListings.filter((item) => {
    if (activeCategory && (item.category || '').trim().toLowerCase() !== activeCategory) return false
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
    listingsContainer.innerHTML = '<div class="muted">No listings match your search.</div>'
    return
  }
  filtered.forEach(renderListing)
}

function renderListing(l) {
  const d = document.createElement('div')
  d.className = 'listing'
  const parts = []
  if (l.image_url) parts.push(`<div class="listing-img-wrap"><img src="${l.image_url}" alt="" loading="lazy"></div>`)
  parts.push(`<h3>${escapeHtml(l.title)}</h3>`)
  if (l.price) {
    try {
      const num = Number(l.price)
      const formatted = Number.isFinite(num) ? num.toFixed(2) : String(l.price)
      const currencyCode = (l.price_currency || l.currency || '').toString().toUpperCase()
      const symbolMap = { ZAR: 'R', USD: '$' }
      const sym = symbolMap[currencyCode] || (l.price_currency || l.currency || '')
      const display = sym ? `${sym}${formatted}` : formatted
      parts.push(`<div><strong>Price:</strong> ${escapeHtml(display)}</div>`)
    } catch (e) {
      parts.push(`<div><strong>Price:</strong> ${escapeHtml(l.price)}</div>`)
    }
  }
  if (l.payment_type) parts.push(`<div><strong>Payment:</strong> ${escapeHtml(l.payment_type)}</div>`)
  if (l.delivery_type) parts.push(`<div><strong>Delivery:</strong> ${escapeHtml(l.delivery_type)}</div>`)
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

  // Owner-only actions
  if (currentUser && l.user_id && l.user_id === currentUser.id) {
    parts.push(`<div class="listing-actions" style="margin-top:10px"><button class="edit-btn" data-id="${escapeHtml(l.id)}" type="button">Edit</button> <button class="delete-btn" data-id="${escapeHtml(l.id)}" type="button">Delete</button></div>`)
  }

  d.innerHTML = parts.join('\n')
  listingsContainer.appendChild(d)
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// initial load
fetchAndRenderListings()