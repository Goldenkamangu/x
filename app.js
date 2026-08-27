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
const AI_SEARCH_URL = `${SUPABASE_URL}/functions/v1/ai-search`

const db = useSupabase
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : (console.warn('Supabase is not configured. Using localStorage fallback.'), localDb)

// Only this account sees the "Reports" admin button. This is just a UI
// convenience — real enforcement happens via the Supabase RLS policy on
// the reports table, so nobody else can read report contents even if
// they guess the button exists.
// CHANGE THIS to whichever email you actually sign into the marketplace with.
const OWNER_EMAIL = 'goldenkamangu20@gmail.com'

// Small inline SVG icons used in template strings, matching the stroke
// style of the rest of the app's icons (currentColor, rounded strokes).
const ICON_STAR_FILLED = '<svg class="icon icon-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="15" height="15"><path d="M12 2.5l2.9 6.1 6.6.7-4.9 4.6 1.3 6.6L12 17l-5.9 3.5 1.3-6.6-4.9-4.6 6.6-.7z" fill="currentColor" /></svg>'
const ICON_STAR_OUTLINE = '<svg class="icon icon-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="15" height="15"><path d="M12 2.5l2.9 6.1 6.6.7-4.9 4.6 1.3 6.6L12 17l-5.9 3.5 1.3-6.6-4.9-4.6 6.6-.7z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /></svg>'
const ICON_SHIELD = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="14" height="14"><path d="M12 2.5l7.5 3v5.4c0 5-3.2 8.6-7.5 10.6-4.3-2-7.5-5.6-7.5-10.6V5.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>'
const ICON_STORE = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="14" height="14"><path d="M3.5 9l1.2-4.5h14.6L20.5 9M3.5 9v10.5h17V9M3.5 9a2.6 2.6 0 0 0 5 1.1A2.6 2.6 0 0 0 13.5 10a2.6 2.6 0 0 0 5 0A2.6 2.6 0 0 0 20.5 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M9.5 19.5V14h5v5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>'
const ICON_CART = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="16" height="16"><path d="M3 4h2l1.7 10.2a2 2 0 0 0 2 1.8h7.7a2 2 0 0 0 2-1.7L20 7H6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="20" r="1.1" fill="currentColor"/><circle cx="18" cy="20" r="1.1" fill="currentColor"/></svg>'

// Elements
const nameEl = document.getElementById('name')
const emailEl = document.getElementById('email')
const passwordEl = document.getElementById('password')
const btnSignup = document.getElementById('btn-signup')
const btnLogin = document.getElementById('btn-login')
const authMsg = document.getElementById('auth-msg')
const authSection = document.getElementById('auth-section')
const heroCtaSell = document.getElementById('hero-cta-sell')
const heroCtaBrowse = document.getElementById('hero-cta-browse')
const heroListingCount = document.getElementById('hero-listing-count')

heroCtaSell?.addEventListener('click', () => {
  if (currentUser && createListingSection) {
    createListingSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => focusListingField(titleEl), 350)
  } else {
    authSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})
heroCtaBrowse?.addEventListener('click', () => {
  document.getElementById('feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})
const accountOverlay = document.getElementById('account-overlay')
const accountClose = document.getElementById('account-close')
const accountCancel = document.getElementById('account-cancel')
const accountForm = document.getElementById('account-form')
const accountName = document.getElementById('account-name')
const accountEmail = document.getElementById('account-email')
const accountPassword = document.getElementById('account-password')
const accountPasswordConfirm = document.getElementById('account-password-confirm')
const accountMsg = document.getElementById('account-msg')
let storesById = {}
const accountDelete = document.getElementById('account-delete')

// --- Nav drawer: single consolidated menu (replaces the old scattered
// pills + floating gear icon) ---
const navHamburger = document.getElementById('nav-hamburger')

// Keep the hamburger button pinned to the viewport corner even on mobile
// browsers with unusual fixed-position behaviour during scroll — same fix
// the old account gear icon used.
if (navHamburger) {
  const pinHamburger = () => {
    navHamburger.style.position = 'fixed'
    navHamburger.style.transform = 'translate3d(0,0,0)'
  }
  window.addEventListener('scroll', pinHamburger, { passive: true })
  window.addEventListener('resize', pinHamburger)
  pinHamburger()
}
const navDrawer = document.getElementById('nav-drawer')
const navDrawerBackdrop = document.getElementById('nav-drawer-backdrop')
const navDrawerClose = document.getElementById('nav-drawer-close')
const navDrawerUser = document.getElementById('nav-drawer-user')
const navDrawerMenu = document.getElementById('nav-drawer-menu')

function openDrawer() {
  if (!navDrawer) return
  navDrawer.classList.add('open')
  navDrawer.setAttribute('aria-hidden', 'false')
  navDrawerBackdrop?.classList.remove('hidden')
  requestAnimationFrame(() => navDrawerBackdrop?.style.setProperty('opacity', '1'))
  navHamburger?.setAttribute('aria-expanded', 'true')
  navHamburger?.classList.add('drawer-is-open')
  document.documentElement.classList.add('lightbox-open')
}
function closeDrawer() {
  if (!navDrawer) return
  navDrawer.classList.remove('open')
  navDrawer.setAttribute('aria-hidden', 'true')
  navDrawerBackdrop?.style.setProperty('opacity', '0')
  setTimeout(() => navDrawerBackdrop?.classList.add('hidden'), 200)
  navHamburger?.setAttribute('aria-expanded', 'false')
  navHamburger?.classList.remove('drawer-is-open')
  document.documentElement.classList.remove('lightbox-open')
}
navHamburger?.addEventListener('click', openDrawer)
navDrawerClose?.addEventListener('click', closeDrawer)
navDrawerBackdrop?.addEventListener('click', closeDrawer)

const ICON_LISTINGS = '<svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M7 9h10M7 12.5h10M7 16h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>'
const ICON_GEAR = '<svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M9.7 2.9h4.6l.7 2.3a7.8 7.8 0 0 1 1.9 1.1l2.3-.7 2.3 4-1.7 1.6a7.8 7.8 0 0 1 0 2.2l1.7 1.6-2.3 4-2.3-.7a7.8 7.8 0 0 1-1.9 1.1l-.7 2.3H9.7L9 19.4a7.8 7.8 0 0 1-1.9-1.1l-2.3.7-2.3-4 1.7-1.6a7.8 7.8 0 0 1 0-2.2L2.5 9.6l2.3-4 2.3.7A7.8 7.8 0 0 1 9 5.2l.7-2.3Z" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.15" fill="none" stroke="currentColor" stroke-width="1.55"/></svg>'
const ICON_DOC = '<svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M14 3.5V8h4M9 12.5h6M9 16h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>'
const ICON_LOGOUT = '<svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M9 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h3M15.5 16l4-4-4-4M19 12H9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>'
const ICON_SIGNIN = '<svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M15 19.5h3A1.5 1.5 0 0 0 19.5 18V6A1.5 1.5 0 0 0 18 4.5h-3M8.5 16l-4-4 4-4M5 12h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>'
const ICON_INSTALL = '<svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 3v11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M7.5 10.5 12 15l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19.5h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'

function drawerItem({ icon, label, danger }) {
  return `<button type="button" class="drawer-item${danger ? ' danger' : ''}" data-drawer-action="${label}">${icon}<span>${label}</span></button>`
}

function buildDrawerMenu() {
  if (!navDrawerMenu || !navDrawerUser) return
  navDrawerMenu.innerHTML = ''
  if (currentUser) {
    const rawDisplayName = currentUser.user_metadata?.full_name || getDisplayNameFromEmail(currentUser.email)
    const displayName = rawDisplayName.trim().split(/\s+/).filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ')
    const hasStore = !!storesById[String(currentUser.id)]?.name
    const isSiteOwner = String(currentUser.email || '').toLowerCase() === OWNER_EMAIL
    navDrawerUser.innerHTML = `${escapeHtml(displayName)}<div class="muted">${escapeHtml(currentUser.email || '')}</div>`
    navDrawerUser.style.display = ''
    const buttons = [
      { icon: ICON_LISTINGS, label: 'My Listings', action: () => openMyListings() },
      { icon: ICON_CART, label: 'My Cart', action: () => openCart() },
      { icon: ICON_STORE, label: hasStore ? 'My Store' : 'Open a Store', action: () => openStoreManage() },
      { icon: ICON_GEAR, label: 'Account Settings', action: () => openAccountSettings() },
    ]
    if (isSiteOwner) buttons.push({ icon: ICON_SHIELD, label: 'Reports', action: () => openAdminReports() })
    buttons.push({ icon: ICON_DOC, label: 'Terms & Conditions', action: () => openTerms() })
    buttons.push({ icon: ICON_INSTALL, label: 'Install LinkHub', action: () => promptInstall() })
    buttons.forEach((b) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'drawer-item'
      el.innerHTML = `${b.icon}<span>${escapeHtml(b.label)}</span>`
      el.addEventListener('click', () => { closeDrawer(); b.action() })
      navDrawerMenu.appendChild(el)
    })
    const divider = document.createElement('div')
    divider.className = 'drawer-divider'
    navDrawerMenu.appendChild(divider)
    const logoutBtn = document.createElement('button')
    logoutBtn.type = 'button'
    logoutBtn.className = 'drawer-item danger'
    logoutBtn.innerHTML = `${ICON_LOGOUT}<span>Logout</span>`
    logoutBtn.addEventListener('click', async () => {
      closeDrawer()
      await db.auth.signOut()
      authMsg.textContent = 'Logged out.'
      await handleAuthChange()
    })
    navDrawerMenu.appendChild(logoutBtn)
  } else {
    navDrawerUser.style.display = 'none'
    const signInBtn = document.createElement('button')
    signInBtn.type = 'button'
    signInBtn.className = 'drawer-item'
    signInBtn.innerHTML = `${ICON_SIGNIN}<span>Sign In / Sign Up</span>`
    signInBtn.addEventListener('click', () => {
      closeDrawer()
      authSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    navDrawerMenu.appendChild(signInBtn)
    const installBtn = document.createElement('button')
    installBtn.type = 'button'
    installBtn.className = 'drawer-item'
    installBtn.innerHTML = `${ICON_INSTALL}<span>Install LinkHub</span>`
    installBtn.addEventListener('click', () => { closeDrawer(); promptInstall() })
    navDrawerMenu.appendChild(installBtn)
    const cartBtn = document.createElement('button')
    cartBtn.type = 'button'
    cartBtn.className = 'drawer-item'
    cartBtn.innerHTML = `${ICON_CART}<span>My Cart <span class="nav-cart-count" data-cart-count></span></span>`
    cartBtn.addEventListener('click', () => { closeDrawer(); openCart() })
    navDrawerMenu.appendChild(cartBtn)
    const termsBtn = document.createElement('button')
    termsBtn.type = 'button'
    termsBtn.className = 'drawer-item'
    termsBtn.innerHTML = `${ICON_DOC}<span>Terms & Conditions</span>`
    termsBtn.addEventListener('click', () => { closeDrawer(); openTerms() })
    navDrawerMenu.appendChild(termsBtn)
  }
}

const desktopNav = document.getElementById('desktop-nav')

function desktopButton(label, action, primary = false, danger = false) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `nav-action${primary ? ' primary' : ''}${danger ? ' danger' : ''}`
  button.textContent = label
  button.addEventListener('click', action)
  return button
}

function desktopButtonWithIcon(label, icon, action, primary = false, danger = false) {
  const button = desktopButton(label, action, primary, danger)
  button.innerHTML = `${icon}<span>${escapeHtml(label)}</span>`
  return button
}

function promptInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt()
    deferredInstallPrompt.userChoice?.catch(() => null).finally(() => { deferredInstallPrompt = null })
    return
  }
  // On iOS and browsers without the install prompt API, keep this user-invoked action quiet.
  showInstallInstructions?.()
}

function showInstallInstructions() {
  // No automatic popup: only a small, user-triggered notice when installation instructions are actually needed.
  const existing = document.getElementById('install-help')
  if (existing) return
  const box = document.createElement('div')
  box.id = 'install-help'
  box.className = 'install-help'
  box.innerHTML = '<span>Use your browser menu and choose <strong>Install LinkHub</strong> or <strong>Add to Home Screen</strong>.</span><button type="button" aria-label="Close">&times;</button>'
  document.body.appendChild(box)
  box.querySelector('button')?.addEventListener('click', () => box.remove())
  setTimeout(() => box.remove(), 6500)
}

function updateCartCounts() {
  const count = cartIds.size
  document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = count ? `(${count})` : '' })
}

function buildDesktopNav() {
  if (!desktopNav) return
  desktopNav.innerHTML = ''
  if (!currentUser) {
    desktopNav.appendChild(desktopButtonWithIcon('Cart', ICON_CART, () => openCart()))
    desktopNav.appendChild(desktopButton('Sign in / Sign up', () => authSection?.scrollIntoView({ behavior: 'smooth', block: 'start' }), true))
    desktopNav.appendChild(desktopButtonWithIcon('Install', ICON_INSTALL, () => promptInstall()))
    desktopNav.appendChild(desktopButton('Terms', () => openTerms()))
    updateCartCounts()
    return
  }

  const rawDisplayName = currentUser.user_metadata?.full_name || getDisplayNameFromEmail(currentUser.email)
  const displayName = rawDisplayName.trim().split(/\s+/).filter(Boolean)[0] || 'Account'
  const store = getStoreForUser(currentUser.id)
  desktopNav.appendChild(desktopButton('Browse', () => document.getElementById('feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })))
  desktopNav.appendChild(desktopButtonWithIcon('Cart', ICON_CART, () => openCart()))
  desktopNav.appendChild(desktopButton('Post a Listing', () => createListingSection?.scrollIntoView({ behavior: 'smooth', block: 'start' }), true))
  desktopNav.appendChild(desktopButton('My Listings', () => openMyListings()))
  desktopNav.appendChild(desktopButton(store?.name ? 'My Store' : 'Open Store', () => openStoreManage()))
  desktopNav.appendChild(desktopButton('Account', () => openAccountSettings()))
  if (String(currentUser.email || '').toLowerCase() === OWNER_EMAIL) desktopNav.appendChild(desktopButton('Reports', () => openAdminReports()))
  desktopNav.appendChild(desktopButtonWithIcon('Install', ICON_INSTALL, () => promptInstall()))
  desktopNav.appendChild(desktopButton('Terms', () => openTerms()))
  const user = document.createElement('span')
  user.className = 'nav-user'
  user.innerHTML = `<span class="nav-user-dot" aria-hidden="true"></span>${escapeHtml(displayName)}`
  desktopNav.appendChild(user)
  desktopNav.appendChild(desktopButton('Logout', async () => {
    await db.auth.signOut()
    authMsg.textContent = 'Logged out.'
    await handleAuthChange()
  }, false, true))
  updateCartCounts()
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

// Keep the visible multiline editor and its hidden form value in sync.
function setListingField(el, value) {
  if (!el) return
  el.value = value ?? ''
  const editor = document.getElementById(`${el.id}-editor`)
  if (editor) {
    editor.value = el.value
    editor.style.height = 'auto'
    editor.style.height = `${Math.max(44, editor.scrollHeight)}px`
  }
}
function focusListingField(el) {
  const editor = el ? document.getElementById(`${el.id}-editor`) : null
  ;(editor || el)?.focus()
}
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
const CART_STORAGE_KEY = 'linkhub-cart-v1'
let cartIds = new Set(loadStoredJSON(CART_STORAGE_KEY, []).map(String))
const cartOverlay = document.getElementById('cart-overlay')
const cartClose = document.getElementById('cart-close')
const cartItemsEl = document.getElementById('cart-items')
const cartFooter = document.getElementById('cart-footer')
const cartCountLabel = document.getElementById('cart-count-label')
const cartClear = document.getElementById('cart-clear')
const uxToast = document.getElementById('ux-toast')
let uxToastTimer = null

function persistCart() {
  saveStoredJSON(CART_STORAGE_KEY, [...cartIds])
}
function showUxToast(message, tone = 'default') {
  if (!uxToast) return
  uxToast.textContent = message
  uxToast.dataset.tone = tone
  uxToast.classList.add('show')
  clearTimeout(uxToastTimer)
  uxToastTimer = setTimeout(() => uxToast.classList.remove('show'), 2400)
}
function cartItems() {
  return [...cartIds].map(id => currentListings.find(item => String(item.id) === String(id))).filter(Boolean)
}
function cartHas(id) { return cartIds.has(String(id)) }
function addToCart(id) {
  const item = currentListings.find(row => String(row.id) === String(id))
  if (!item) return
  cartIds.add(String(id))
  persistCart()
  renderCart()
  updateCartCounts()
  renderFilteredListings()
  showUxToast(`“${item.title || 'Listing'}” added to your cart.`)
}
function removeFromCart(id, rerender = true) {
  cartIds.delete(String(id))
  persistCart()
  if (rerender) { renderCart(); updateCartCounts(); renderFilteredListings() }
}
function openCart() {
  if (!cartOverlay) return
  renderCart()
  cartOverlay.classList.remove('hidden')
  cartOverlay.setAttribute('aria-hidden','false')
  document.documentElement.classList.add('lightbox-open')
}
function closeCart() {
  if (!cartOverlay) return
  cartOverlay.classList.add('hidden')
  cartOverlay.setAttribute('aria-hidden','true')
  document.documentElement.classList.remove('lightbox-open')
}
function formatListingPrice(item) {
  const n = Number(item?.price)
  if (!Number.isFinite(n)) return item?.price ? String(item.price) : 'Price on request'
  const code = String(item.price_currency || item.currency || '').toUpperCase()
  return `${code === 'USD' ? '$' : code === 'ZAR' ? 'R' : ''}${n.toFixed(2)}`
}
function renderCart() {
  if (!cartItemsEl) return
  const items = cartItems()
  cartItemsEl.innerHTML = ''
  if (!items.length) {
    cartItemsEl.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon">${ICON_CART}</div><h3>Your cart is empty</h3><p class="muted">Save listings you're interested in and they'll appear here.</p><button type="button" class="hero-btn hero-btn-primary cart-browse-btn">Browse Listings</button></div>`
    cartFooter?.classList.add('hidden')
    return
  }
  cartFooter?.classList.remove('hidden')
  if (cartCountLabel) cartCountLabel.textContent = `${items.length} item${items.length === 1 ? '' : 's'} saved`
  for (const item of items) {
    const row = document.createElement('article')
    row.className = 'cart-item'
    const img = getListingImages(item).find(isValidImageUrl)
    row.innerHTML = `${img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy">` : `<div class="cart-item-placeholder">${ICON_CART}</div>`}
      <div class="cart-item-main"><h3>${escapeHtml(item.title || 'Listing')}</h3><strong>${escapeHtml(formatListingPrice(item))}</strong><span class="muted">${escapeHtml(item.location || item.city || item.category || 'LinkHub listing')}</span></div>
      <div class="cart-item-actions"><button type="button" class="cart-view-btn" data-id="${escapeHtml(item.id)}">View</button><button type="button" class="cart-remove-btn" data-id="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.title || 'item')}">Remove</button></div>`
    cartItemsEl.appendChild(row)
  }
}
cartClose?.addEventListener('click', closeCart)
cartOverlay?.addEventListener('click', ev => { if (ev.target === cartOverlay) closeCart() })
cartClear?.addEventListener('click', () => { cartIds.clear(); persistCart(); renderCart(); renderFilteredListings(); showUxToast('Cart cleared.') })
cartItemsEl?.addEventListener('click', ev => {
  const browse = ev.target.closest('.cart-browse-btn')
  if (browse) { closeCart(); document.getElementById('feed')?.scrollIntoView({behavior:'smooth', block:'start'}); return }
  const remove = ev.target.closest('.cart-remove-btn')
  if (remove) { removeFromCart(remove.dataset.id); showUxToast('Removed from cart.'); return }
  const view = ev.target.closest('.cart-view-btn')
  if (view) { closeCart(); const card = document.querySelector(`[data-listing-id="${CSS.escape(String(view.dataset.id))}"]`); if (card) card.scrollIntoView({behavior:'smooth', block:'center'}); else { searchEl.value=''; visibleCount=PAGE_SIZE; renderFilteredListings(); setTimeout(()=>document.querySelector(`[data-listing-id="${CSS.escape(String(view.dataset.id))}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),50) } }
})
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
updateCartCounts()


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

function normalizePhoneNumber(details) {
  const raw = String(details || '').trim()
  if (!raw) return null

  // Accepts international (+27...), international-with-leading-zeros
  // (0027...), and local South African format (06..., 07..., 08...).
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
  const number = normalizePhoneNumber(details)
  if (!number) return null
  return `https://wa.me/${number}`
}

function buildTelegramUrl(details) {
  const raw = String(details || '').trim()
  if (!raw) return null
  // Username (with or without @) → t.me/username. Phone number → t.me/+number.
  const asUsername = raw.replace(/^@/, '')
  if (/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(asUsername)) {
    return `https://t.me/${asUsername}`
  }
  const number = normalizePhoneNumber(raw)
  if (number) return `https://t.me/+${number}`
  return null
}

function buildEmailUrl(details) {
  const raw = String(details || '').trim()
  if (!raw || !raw.includes('@')) return null
  return `mailto:${raw}`
}

function buildPhoneUrl(details) {
  const number = normalizePhoneNumber(details)
  if (!number) return null
  return `tel:+${number}`
}

// Returns { url, label } for a clickable contact link, or null if the
// method doesn't have a reliable deep link (e.g. "Direct Message").
function buildContactLink(method, details) {
  const m = String(method || '').toLowerCase()
  if (m === 'whatsapp') { const u = buildWhatsAppUrl(details); return u ? { url: u, label: `WhatsApp ${details}` } : null }
  if (m === 'telegram') { const u = buildTelegramUrl(details); return u ? { url: u, label: `Telegram ${details}` } : null }
  if (m === 'email') { const u = buildEmailUrl(details); return u ? { url: u, label: `Email ${details}` } : null }
  if (m === 'phone') { const u = buildPhoneUrl(details); return u ? { url: u, label: `Call ${details}` } : null }
  return null
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
  const isOwnerAccount = String(currentUser.email || '').toLowerCase() === OWNER_EMAIL
  document.getElementById('account-admin-section')?.classList.toggle('hidden', !isOwnerAccount)
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
  accountMsg.textContent = 'Preparing your account for deletion…'
  try {
    if (useSupabase) {
      // The SQL delete_my_account() function removes the database rows and
      // auth account, but it cannot safely remove Storage objects by itself.
      // Collect every listing image + store banner while the user is still
      // authenticated, then remove them through the Storage API before the
      // account is finally deleted. If any Storage deletion fails, stop here
      // so we do not leave an account behind with files we can no longer reach.
      const uid = currentUser.id
      const [{ data: userListings, error: listingsErr }, { data: userStore, error: storeErr }] = await Promise.all([
        db.from('listings').select('*').eq('user_id', uid),
        db.from('stores').select('*').eq('id', uid).maybeSingle()
      ])
      if (listingsErr) throw listingsErr
      if (storeErr && storeErr.code !== 'PGRST116') throw storeErr

      const storagePaths = []
      for (const listing of userListings || []) storagePaths.push(...extractStoragePaths(listing))
      if (userStore?.banner_url) storagePaths.push(...extractStoragePaths({ image_url: userStore.banner_url }))

      const uniquePaths = [...new Set(storagePaths)]
      if (uniquePaths.length && db.storage) {
        accountMsg.textContent = `Removing ${uniquePaths.length} stored image${uniquePaths.length === 1 ? '' : 's'}…`
        const { error: storageErr } = await db.storage.from('listing-images').remove(uniquePaths)
        if (storageErr) throw storageErr
      }

      accountMsg.textContent = 'Deleting your account…'
      const result = await db.rpc('delete_my_account')
      if (result.error) throw result.error
    } else {
      const result = await db.auth.deleteUser()
      if (result.error) throw result.error
    }

    await db.auth.signOut()
    closeAccountSettings()
    authMsg.textContent = 'Your account has been deleted.'
    await handleAuthChange()
  } catch (err) {
    console.error('Account deletion failed', err)
    accountMsg.textContent = err?.message || 'We could not delete your account. No account records were removed.'
  }
}

accountClose?.addEventListener('click', closeAccountSettings)
accountCancel?.addEventListener('click', closeAccountSettings)
accountOverlay?.addEventListener('click', (event) => {
  if (event.target === accountOverlay) closeAccountSettings()
})
accountForm?.addEventListener('submit', saveAccountSettings)
accountDelete?.addEventListener('click', deleteAccount)
document.getElementById('account-admin-reports')?.addEventListener('click', () => {
  closeAccountSettings()
  openAdminReports()
})

async function handleAuthChange() {
  const { data } = await db.auth.getUser()
  const user = data.user
  currentUser = user
  loadFavoritesForCurrentUser()
  if (user) {
    authSection.style.display = 'none'
    createListingSection.style.display = ''
    // Keep the form compact by default and allow expanding via More options
    setFormCompact(true)
    setTimeout(() => window.linkhubApplyStoreDefaults?.(), 0)
  } else {
    authSection.style.display = ''
    createListingSection.style.display = 'none'
  }
  buildDrawerMenu()
  buildDesktopNav()
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
  const agreeTermsEl = document.getElementById('agree-terms')
  if (agreeTermsEl && !agreeTermsEl.checked) {
    listingMsg.textContent = 'Please agree to the Terms & Conditions before posting.'
    agreeTermsEl.focus()
    return
  }
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
    const uploadedStoragePaths = []
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
              const storedPath = upData?.path || upData?.Key || path
              if (storedPath) uploadedStoragePaths.push(storedPath)
              const { data: pub } = storage.getPublicUrl(storedPath)
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

    const cleanupUploadedStorage = async () => {
      if (!uploadedStoragePaths.length || !useSupabase || !db.storage) return
      try { await db.storage.from('listing-images').remove([...new Set(uploadedStoragePaths)]) }
      catch (cleanupErr) { console.warn('Could not clean up newly uploaded listing images', cleanupErr) }
    }

    if (!obj.title) { await cleanupUploadedStorage(); return showFormError('Please enter a title for your listing.', titleEl) }
    if (!obj.price) { await cleanupUploadedStorage(); return showFormError('Please enter a price for your listing.', priceEl) }
    if (!obj.category) { await cleanupUploadedStorage(); return showFormError('Please choose a category for your listing.', categoryEl) }
    if (obj.contact_method && !obj.contact_details) { await cleanupUploadedStorage(); return showFormError('Please enter your contact details so buyers can reach you.', contactDetailsEl) }
    if (obj.contact_details && !obj.contact_method) { await cleanupUploadedStorage(); return showFormError('Please choose how buyers can contact you.', contactMethodEl) }

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
        if (selectedFiles.length && existingListing) {
          const oldPaths = extractStoragePaths(existingListing).filter((path) => !uploadedStoragePaths.includes(path))
          if (oldPaths.length) {
            try {
              const { error: cleanupErr } = await db.storage.from('listing-images').remove(oldPaths)
              if (cleanupErr) console.warn('Could not remove replaced listing images', cleanupErr)
            } catch (cleanupErr) {
              console.warn('Could not remove replaced listing images', cleanupErr)
            }
          }
        }
      } else {
        const idx = localState.listings.findIndex((r) => r.id === editingId)
        if (idx !== -1) {
          localState.listings[idx] = { ...localState.listings[idx], ...updateObj }
          persistLocalState()
        }
      }

      listingMsg.textContent = 'Listing updated successfully.'
      exitEditMode()
      setListingField(titleEl, '')
      priceEl.value = ''
      if (priceCurrencyEl) priceCurrencyEl.value = 'ZAR'
      paymentTypeEl.value = ''
      setListingField(urlEl, '')
      setListingField(categoryEl, '')
      if (locationEl) setListingField(locationEl, '')
      descEl.value = ''
      contactMethodEl.value = ''
      setListingField(contactDetailsEl, '')
      imageEl.value = ''
      await fetchAndRenderListings()
    } else {
      const { error } = await tryInsert(obj)
      if (error) throw error

      listingMsg.textContent = 'Listing created successfully.'
      setListingField(titleEl, '')
      priceEl.value = ''
      if (priceCurrencyEl) priceCurrencyEl.value = 'ZAR'
        paymentTypeEl.value = ''
        deliveryTypeEl.value = ''
      setListingField(urlEl, '')
      setListingField(categoryEl, '')
      if (locationEl) setListingField(locationEl, '')
      descEl.value = ''
      contactMethodEl.value = ''
      setListingField(contactDetailsEl, '')
      imageEl.value = ''
      await fetchAndRenderListings()
    }
  } catch (err) {
    if (typeof uploadedStoragePaths !== 'undefined' && uploadedStoragePaths.length && useSupabase && db.storage) {
      try { await db.storage.from('listing-images').remove([...new Set(uploadedStoragePaths)]) }
      catch (cleanupErr) { console.warn('Could not clean up listing images after save failure', cleanupErr) }
    }
    listingMsg.textContent = err.message
  }
})

// Cancel edit handler
if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', () => {
    exitEditMode()
    listingMsg.textContent = ''
    setListingField(titleEl, '')
    priceEl.value = ''
    if (priceCurrencyEl) priceCurrencyEl.value = 'ZAR'
    paymentTypeEl.value = ''
    deliveryTypeEl.value = ''
    setListingField(urlEl, '')
    setListingField(categoryEl, '')
    if (locationEl) setListingField(locationEl, '')
    descEl.value = ''
    contactMethodEl.value = ''
    setListingField(contactDetailsEl, '')
    imageEl.value = ''
  })
}

// Delegate edit/delete button clicks inside any listing grid (main feed or My Listings overlay)
document.body.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button')
  if (!btn) return
  const id = btn.dataset && btn.dataset.id
  if (!id) return
  if (btn.classList.contains('rate-star')) {
    if (!currentUser) return alert('Please sign in to rate listings.')
    const value = Number(btn.dataset.value)
    const row = btn.closest('.rate-row')
    try {
      const { error } = await db.from('ratings').upsert({ listing_id: id, rater_id: currentUser.id, rating: value }, { onConflict: 'listing_id,rater_id' })
      if (error) throw error
      myRatingsByListing[String(id)] = value
      const prev = ratingsByListing[String(id)] || { sum: 0, count: 0 }
      // We don't know if this replaced an existing vote from this rater without
      // a fresh fetch, so just refresh from the server for accurate aggregates.
      const { data: freshRows } = await db.from('ratings').select('rating').eq('listing_id', id)
      const sum = (freshRows || []).reduce((a, r) => a + Number(r.rating || 0), 0)
      ratingsByListing[String(id)] = { sum, count: (freshRows || []).length }
      if (row) {
        row.querySelectorAll('.rate-star').forEach((s) => {
          const active = Number(s.dataset.value) <= value
          s.classList.toggle('active', active)
          s.innerHTML = active ? ICON_STAR_FILLED : ICON_STAR_OUTLINE
        })
        const label = row.querySelector('.rate-label')
        if (label) label.textContent = 'Your rating:'
      }
    } catch (e) {
      alert(e.message || 'Could not save your rating — has the ratings table been created in Supabase?')
    }
  }
  if (btn.classList.contains('delete-btn')) {
    if (!currentUser) return alert('You must be signed in to delete listings.')
    if (!confirm('Delete this listing? This cannot be undone.')) return
    try {
      const item = currentListings.find((r) => String(r.id) === String(id)) || localState.listings.find((r) => String(r.id) === String(id))
      if (useSupabase) {
        await deleteListingStorageFiles(item)
        const { error } = await db.from('listings').delete().eq('id', id)
        if (error) throw error
      } else {
        localState.listings = localState.listings.filter((r) => r.id !== id)
        persistLocalState()
      }
      removeFromCart(id, false)
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
    setListingField(titleEl, item.title || '')
      priceEl.value = item.price || ''
      if (priceCurrencyEl) priceCurrencyEl.value = item.price_currency || item.currency || 'ZAR'
    paymentTypeEl.value = item.payment_type || ''
    deliveryTypeEl.value = item.delivery_type || ''
    setListingField(urlEl, item.url || '')
    setListingField(categoryEl, item.category || '')
    if (locationEl) setListingField(locationEl, item.location || item.city || '')
    contactMethodEl.value = item.contact_method || ''
    setListingField(contactDetailsEl, item.contact_details || '')
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
        let { error } = await db.from('listings').update({ sold: nowSold, sold_at: nowSold ? new Date().toISOString() : null }).eq('id', id)
        if (error && /column .*sold_at.* does not exist|Could not find the 'sold_at' column/i.test(error.message || '')) {
          ;({ error } = await db.from('listings').update({ sold: nowSold }).eq('id', id))
        }
        if (error) throw error
      } else {
        const idx = localState.listings.findIndex((r) => r.id === id)
        if (idx !== -1) { localState.listings[idx].sold = nowSold; localState.listings[idx].sold_at = nowSold ? new Date().toISOString() : null; persistLocalState() }
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
    btn.textContent = ''
    btn.innerHTML = favoritedIds.has(id) ? `${ICON_STAR_FILLED} Saved` : `${ICON_STAR_OUTLINE} Save`
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
        const buyerName = currentUser.user_metadata?.full_name || currentUser.email || 'A buyer'
        const { error } = await db.from('offers').insert([{
          listing_id: id,
          buyer_id: currentUser.id,
          seller_id: item?.user_id || null,
          amount: numAmount,
          buyer_name: buyerName,
          buyer_contact: currentUser.email || null,
        }])
        if (error) throw error
      }
      alert('Offer sent! Check My Listings to see offers on your own posts.')
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
        await db.from('reports').insert([{ listing_id: id, reporter_id: currentUser?.id || null, reason, reporter_name: currentUser.user_metadata?.full_name || currentUser.email || null }])
      }
    } catch (e) {
      console.warn('Report insert failed (table may not exist yet):', e)
    }
    alert("Thanks, we'll look into it.")
  }
})

function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen')
  if (!loadingScreen) return
  loadingScreen.classList.add('hidden')
  document.body.classList.add('app-ready')
}

document.addEventListener('DOMContentLoaded', () => {
  // Hide it normally as soon as the DOM is ready.
  hideLoadingScreen()

  // Small delay keeps the transition smooth without risking a stuck screen.
  setTimeout(hideLoadingScreen, 1100)

  // Ensure the listing form starts compact and toggle text is correct
  try {
    setFormCompact(true)
  } catch (e) {}
})

// If the page finishes loading after the DOM event, make sure the loading
// screen is gone. The final timeout below is a safety net if another script
// fails before normal initialization completes.
window.addEventListener('load', hideLoadingScreen)
setTimeout(hideLoadingScreen, 4000)

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
  loadOffersForMyListings(mine.map((item) => item.id))
}

async function loadOffersForMyListings(listingIds) {
  if (!useSupabase || !currentUser || !listingIds.length) return
  try {
    const { data, error } = await db.from('offers').select('*').eq('seller_id', currentUser.id)
    if (error) throw error
    const byListing = {}
    for (const offer of data || []) {
      const key = String(offer.listing_id)
      if (!byListing[key]) byListing[key] = []
      byListing[key].push(offer)
    }
    for (const id of listingIds) {
      const offers = byListing[String(id)]
      if (!offers || !offers.length) continue
      const card = myListingsGrid.querySelector(`[data-listing-id="${CSS.escape(String(id))}"]`)
      if (!card) continue
      offers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      const rows = offers.map((o) => {
        const amountStr = Number.isFinite(Number(o.amount)) ? Number(o.amount).toFixed(2) : o.amount
        const mail = o.buyer_contact ? `<a href="mailto:${escapeHtml(o.buyer_contact)}">${escapeHtml(o.buyer_contact)}</a>` : ''
        return `<div class="offer-row"><strong>${escapeHtml(amountStr)}</strong> from ${escapeHtml(o.buyer_name || 'a buyer')}${mail ? ` — ${mail}` : ''}</div>`
      }).join('')
      const box = document.createElement('div')
      box.className = 'offers-box'
      box.innerHTML = `<div class="offers-box-title">${offers.length} offer${offers.length === 1 ? '' : 's'}</div>${rows}`
      card.appendChild(box)
    }
  } catch (e) {
    console.warn('Loading offers failed:', e)
  }
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

// --- Terms & Conditions overlay ---
const termsOverlay = document.getElementById('terms-overlay')
const termsClose = document.getElementById('terms-close')
function openTerms() {
  if (!termsOverlay) return
  termsOverlay.classList.remove('hidden')
  termsOverlay.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
}
function closeTerms() {
  if (!termsOverlay) return
  termsOverlay.classList.add('hidden')
  termsOverlay.setAttribute('aria-hidden', 'true')
  document.documentElement.classList.remove('lightbox-open')
}
document.getElementById('open-terms-link')?.addEventListener('click', openTerms)
document.getElementById('footer-terms-link')?.addEventListener('click', openTerms)
termsClose?.addEventListener('click', closeTerms)
termsOverlay?.addEventListener('click', (ev) => { if (ev.target === termsOverlay) closeTerms() })
const footerYearEl = document.getElementById('footer-year')
if (footerYearEl) footerYearEl.textContent = String(new Date().getFullYear())

myListingsClose?.addEventListener('click', closeMyListings)

// --- Seller Store: a public page of one seller's listings (their own "stand" in LinkHub) ---
const storeOverlay = document.getElementById('store-overlay')
const storeClose = document.getElementById('store-close')
const storeShareBtn = document.getElementById('store-share')
const storeEditBtn = document.getElementById('store-edit')
const storeGrid = document.getElementById('store-grid')
const storeCount = document.getElementById('store-count')
const storeNameHeading = document.getElementById('store-name')
const storeBannerImg = document.getElementById('store-banner')
const storeLogoImg = document.getElementById('store-logo')
const storeCategoryEl = document.getElementById('store-category')
const storeBioEl = document.getElementById('store-bio')
const storeContactMeta = document.getElementById('store-contact-meta')
let activeStoreUserId = null

async function shareActiveStore() {
  if (!activeStoreUserId) return
  const store = getStoreForUser(activeStoreUserId)
  const name = store?.name || 'LinkHub Store'
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('store', activeStoreUserId)
  const shareData = { title: name, text: `${name} on LinkHub`, url: url.toString() }
  try {
    if (navigator.share) {
      await navigator.share(shareData)
      return
    }
  } catch (e) {
    if (e?.name === 'AbortError') return
  }
  try {
    await navigator.clipboard.writeText(url.toString())
    showUxToast('Store link copied to your clipboard.')
  } catch (e) {
    window.prompt('Copy this store link:', url.toString())
  }
}

function renderStoreListings() {
  if (!storeGrid || !activeStoreUserId) return
  storeGrid.innerHTML = ''
  const items = currentListings.filter((item) => String(item.user_id) === String(activeStoreUserId) && !item.sold)
  if (storeCount) storeCount.textContent = `${items.length} listing${items.length === 1 ? '' : 's'}`
  if (!items.length) {
    storeGrid.innerHTML = '<div class="muted">This seller doesn\'t have any active listings right now.</div>'
    return
  }
  sortListings(items).forEach((item) => renderListing(item, storeGrid))
}

// Opens the store/marketplace view for a given seller, reading their name,
// bio, and banner from the stores table (falls back gracefully if missing).
function openStore(userId) {
  if (!storeOverlay || !userId) return
  activeStoreUserId = userId
  const s = getStoreForUser(userId)
  if (storeNameHeading) storeNameHeading.textContent = s?.name || 'Seller Marketplace'
  if (storeBioEl) storeBioEl.textContent = s?.bio || ''
  if (storeCategoryEl) {
    storeCategoryEl.textContent = s?.category || ''
    storeCategoryEl.classList.toggle('hidden', !s?.category)
  }
  if (storeLogoImg) {
    if (s?.logo_url) { storeLogoImg.src = s.logo_url; storeLogoImg.classList.remove('hidden') }
    else { storeLogoImg.src = ''; storeLogoImg.classList.add('hidden') }
  }
  if (storeContactMeta) {
    const bits = []
    if (s?.phone) bits.push(`<span>📞 ${escapeHtml(s.phone)}</span>`)
    if (s?.location) bits.push(`<span>📍 ${escapeHtml(s.location)}</span>`)
    if (s?.address) bits.push(`<span>⌖ ${escapeHtml(s.address)}</span>`)
    if (s?.opening_hours) bits.push(`<span>🕒 ${escapeHtml(s.opening_hours)}</span>`)
    if (s?.fulfilment) bits.push(`<span>🚚 ${escapeHtml(s.fulfilment)}</span>`)
    storeContactMeta.innerHTML = bits.join('')
  }
  if (storeEditBtn) {
    const isMine = currentUser && String(currentUser.id) === String(userId)
    storeEditBtn.classList.toggle('hidden', !isMine)
  }
  if (storeBannerImg) {
    if (s?.banner_url) {
      storeBannerImg.src = s.banner_url
      storeBannerImg.classList.remove('hidden')
    } else {
      storeBannerImg.src = ''
      storeBannerImg.classList.add('hidden')
    }
  }
  renderStoreListings()
  storeOverlay.classList.remove('hidden')
  storeOverlay.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
  const params = new URLSearchParams(window.location.search)
  params.set('store', userId)
  history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
}

function closeStore() {
  if (!storeOverlay) return
  activeStoreUserId = null
  storeOverlay.classList.add('hidden')
  storeOverlay.setAttribute('aria-hidden', 'true')
  document.documentElement.classList.remove('lightbox-open')
  const params = new URLSearchParams(window.location.search)
  if (params.has('store')) {
    params.delete('store')
    const query = params.toString()
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''))
  }
}

storeClose?.addEventListener('click', closeStore)
storeShareBtn?.addEventListener('click', shareActiveStore)
storeEditBtn?.addEventListener('click', () => { closeStore(); openStoreManage() })
storeOverlay?.addEventListener('click', (ev) => {
  if (ev.target === storeOverlay) closeStore()
})

// Deep link: ?store=<user_id> opens that seller's store directly (e.g. from a shared link).
function openStoreFromUrlIfPresent() {
  const params = new URLSearchParams(window.location.search)
  const targetId = params.get('store')
  if (!targetId || activeStoreUserId === targetId) return
  openStore(targetId)
}

// --- My Store manager: standalone overlay to create/edit your store,
// separate from Account Settings, reachable via the "My Store" nav pill.
function getStoreForUser(userId) {
  return storesById[String(userId)] || null
}

function indexStoreRows(rows) {
  const next = {}
  for (const row of rows || []) {
    const key = row?.user_id ?? row?.id
    if (key != null) next[String(key)] = row
  }
  return next
}

const storeManageOverlay = document.getElementById('store-manage-overlay')
const storeManageClose = document.getElementById('store-manage-close')
const storeManageForm = document.getElementById('store-manage-form')
const storeManageHeading = document.getElementById('store-manage-heading')
const storeManageIntro = document.getElementById('store-manage-intro')
const storeManageName = document.getElementById('store-manage-name')
const storeManageCategory = document.getElementById('store-manage-category')
const storeManagePhone = document.getElementById('store-manage-phone')
const storeManageLocation = document.getElementById('store-manage-location')
const storeManageAddress = document.getElementById('store-manage-address')
const storeManageBio = document.getElementById('store-manage-bio')
const storeManageHours = document.getElementById('store-manage-hours')
const storeManageFulfilment = document.getElementById('store-manage-fulfilment')
const storeManageLogo = document.getElementById('store-manage-logo')
const storeManageLogoPreview = document.getElementById('store-manage-logo-preview')
const storeManageBanner = document.getElementById('store-manage-banner')
const storeManageBannerPreview = document.getElementById('store-manage-banner-preview')
const storeManageMsg = document.getElementById('store-manage-msg')
const storeManageViewBtn = document.getElementById('store-manage-view')
const storeManageSave = document.getElementById('store-manage-save')
const storeManageDeleteBtn = document.getElementById('store-manage-delete')

function openStoreManage() {
  if (!storeManageOverlay || !currentUser) return
  const mine = getStoreForUser(currentUser.id)
  storeManageHeading.textContent = mine?.name ? 'My Store' : 'Open Your Store'
  storeManageIntro.textContent = mine?.name
    ? 'Update your storefront and keep your business listings together in one place.'
    : "You do not need your own website. Open a free LinkHub storefront, add your products as listings, and share one link with customers."
  storeManageName.value = mine?.name || ''
  storeManageCategory.value = mine?.category || ''
  storeManagePhone.value = mine?.phone || ''
  storeManageLocation.value = mine?.location || ''
  storeManageAddress.value = mine?.address || ''
  storeManageBio.value = mine?.bio || ''
  storeManageHours.value = mine?.opening_hours || ''
  storeManageFulfilment.value = mine?.fulfilment || ''
  storeManageLogo.value = ''
  storeManageBanner.value = ''
  if (mine?.logo_url) {
    storeManageLogoPreview.src = mine.logo_url
    storeManageLogoPreview.classList.remove('hidden')
  } else {
    storeManageLogoPreview.src = ''
    storeManageLogoPreview.classList.add('hidden')
  }
  if (mine?.banner_url) {
    storeManageBannerPreview.src = mine.banner_url
    storeManageBannerPreview.classList.remove('hidden')
  } else {
    storeManageBannerPreview.src = ''
    storeManageBannerPreview.classList.add('hidden')
  }
  storeManageMsg.textContent = ''
  storeManageViewBtn.style.display = mine?.name ? '' : 'none'
  storeManageDeleteBtn?.classList.toggle('hidden', !mine?.name)
  window.linkhubRefreshStoreUx?.()
  storeManageOverlay.classList.remove('hidden')
  storeManageOverlay.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
}

function closeStoreManage() {
  if (!storeManageOverlay) return
  storeManageOverlay.classList.add('hidden')
  storeManageOverlay.setAttribute('aria-hidden', 'true')
  document.documentElement.classList.remove('lightbox-open')
}

const businessStoreOpenBtn = document.getElementById('business-store-open')
const businessStoreLearnBtn = document.getElementById('business-store-learn')

businessStoreOpenBtn?.addEventListener('click', () => {
  if (currentUser) {
    openStoreManage()
  } else {
    authSection?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    authMsg.textContent = 'Sign in or create an account first, then you can open your free LinkHub store.'
  }
})

businessStoreLearnBtn?.addEventListener('click', () => {
  document.getElementById('business-store-cta')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

async function saveStoreManage(event) {
  event.preventDefault()
  if (!currentUser) return
  storeManageMsg.textContent = ''
  const name = storeManageName.value.trim()
  const category = storeManageCategory.value.trim()
  const phone = storeManagePhone.value.trim()
  const location = storeManageLocation.value.trim()
  const address = storeManageAddress.value.trim()
  const bio = storeManageBio.value.trim()
  const opening_hours = storeManageHours.value.trim()
  const fulfilment = storeManageFulfilment.value
  if (!name) { storeManageMsg.textContent = 'Please enter a store name.'; return }
  if (!useSupabase) { storeManageMsg.textContent = 'Stores need a live Supabase connection to save.'; return }

  storeManageMsg.textContent = 'Saving…'
  const existingStore = getStoreForUser(currentUser.id)
  let banner_url = existingStore?.banner_url || null
  let logo_url = existingStore?.logo_url || null
  let uploadedBannerPath = null
  let uploadedLogoPath = null
  const storage = db.storage.from('listing-images')

  async function uploadStoreImage(file, prefix, maxSize = 1200, quality = 0.82) {
    if (!file) return null
    const compressed = await compressImage(file, maxSize, quality)
    const path = `${currentUser.id}/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}_${compressed.name}`
    const { data: upData, error: upErr } = await storage.upload(path, compressed, { upsert: false })
    if (upErr) throw upErr
    const storedPath = upData?.path || path
    const { data: pub } = storage.getPublicUrl(storedPath)
    return { path: storedPath, url: pub?.publicUrl || null }
  }

  const bannerFile = storeManageBanner.files?.[0]
  const logoFile = storeManageLogo.files?.[0]
  try {
    if (bannerFile) {
      const uploaded = await uploadStoreImage(bannerFile, 'store-banner', 1600, 0.8)
      uploadedBannerPath = uploaded?.path || null
      if (uploaded?.url) banner_url = uploaded.url
    }
    if (logoFile) {
      const uploaded = await uploadStoreImage(logoFile, 'store-logo', 900, 0.84)
      uploadedLogoPath = uploaded?.path || null
      if (uploaded?.url) logo_url = uploaded.url
    }
  } catch (e) {
    if (uploadedBannerPath) try { await storage.remove([uploadedBannerPath]) } catch {}
    if (uploadedLogoPath) try { await storage.remove([uploadedLogoPath]) } catch {}
    storeManageMsg.textContent = `Could not upload store image: ${e?.message || 'Unknown error'}`
    return
  }
  try {
    let payload = { id: currentUser.id, name, category, phone, location, address, bio, opening_hours, fulfilment, logo_url, banner_url, updated_at: new Date().toISOString() }
    let { error: storeErr } = await db.from('stores').upsert(payload)

    // Some existing stores-table SQL schemas use user_id instead of id.
    // Keep the existing SQL untouched and support either frontend shape.
    if (storeErr && /column.*id|not.?null.*id|user_id|duplicate key/i.test(storeErr.message || '')) {
      payload = { user_id: currentUser.id, name, category, phone, location, address, bio, opening_hours, fulfilment, logo_url, banner_url, updated_at: new Date().toISOString() }
      const retry = await db.from('stores').upsert(payload)
      storeErr = retry.error
    }
    if (storeErr) throw storeErr

    storesById[String(currentUser.id)] = { ...payload, id: currentUser.id, user_id: currentUser.id }
    const replacedPaths = []
    if (uploadedBannerPath && existingStore?.banner_url && existingStore.banner_url !== banner_url) {
      replacedPaths.push(...extractStoragePaths({ image_url: existingStore.banner_url }))
    }
    if (uploadedLogoPath && existingStore?.logo_url && existingStore.logo_url !== logo_url) {
      replacedPaths.push(...extractStoragePaths({ image_url: existingStore.logo_url }))
    }
    if (replacedPaths.length) {
      try { await storage.remove([...new Set(replacedPaths)]) }
      catch (cleanupErr) { console.warn('Could not remove replaced store images', cleanupErr) }
    }
    storeManageMsg.textContent = 'Your store is live. You can now add listings and share your store link with customers.'
    storeManageViewBtn.style.display = ''
    storeManageHeading.textContent = 'My Store'
    await handleAuthChange()
    renderFilteredListings()
  } catch (e) {
    const failedUploads = [uploadedBannerPath, uploadedLogoPath].filter(Boolean)
    if (failedUploads.length) {
      try { await storage.remove(failedUploads) }
      catch (cleanupErr) { console.warn('Could not clean up store images after save failure', cleanupErr) }
    }
    console.warn('Saving store failed', e)
    const message = e?.message || 'Unknown Supabase error'
    storeManageMsg.innerHTML = `<strong>Could not save your store.</strong><br><span class="muted">${escapeHtml(message)}</span>`
  }
}

storeManageForm?.addEventListener('submit', saveStoreManage)
storeManageClose?.addEventListener('click', closeStoreManage)
storeManageOverlay?.addEventListener('click', (ev) => {
  if (ev.target === storeManageOverlay) closeStoreManage()
})
storeManageViewBtn?.addEventListener('click', () => {
  if (!currentUser) return
  closeStoreManage()
  openStore(currentUser.id)
})

async function deleteMyStore() {
  if (!currentUser || !useSupabase) return
  const existingStore = getStoreForUser(currentUser.id)
  if (!existingStore?.name) return

  const confirmed = window.confirm(`Delete your LinkHub store “${existingStore.name}”? Your store page and store profile will be removed. Your marketplace listings will NOT be deleted.`)
  if (!confirmed) return

  storeManageMsg.textContent = 'Preparing to delete your store…'
  storeManageDeleteBtn.disabled = true
  storeManageSave?.setAttribute('disabled', 'disabled')

  const storage = db.storage.from('listing-images')
  const restoreFiles = []
  let storePaths = []
  try {
    const media = [existingStore.banner_url, existingStore.logo_url].filter(Boolean)
    storePaths = [...new Set(media.flatMap((url) => extractStoragePaths({ image_url: url })))]

    // Snapshot the files before deletion so we can restore them if the DB delete fails.
    for (const url of media) {
      const path = extractStoragePaths({ image_url: url })[0]
      if (!path) continue
      try {
        const response = await fetch(url, { cache: 'no-store' })
        if (response.ok) restoreFiles.push({ path, blob: await response.blob() })
      } catch (fetchErr) {
        console.warn('Could not snapshot store image before deletion', fetchErr)
      }
    }

    if (storePaths.length) {
      const { error: storageErr } = await storage.remove(storePaths)
      if (storageErr) throw storageErr
    }

    let { error: deleteErr } = await db.from('stores').delete().eq('id', currentUser.id)
    if (deleteErr && /user_id|column.*id/i.test(deleteErr.message || '')) {
      const retry = await db.from('stores').delete().eq('user_id', currentUser.id)
      deleteErr = retry.error
    }
    if (deleteErr) throw deleteErr

    delete storesById[String(currentUser.id)]
    closeStoreManage()
    if (activeStoreUserId === currentUser.id) closeStore()
    await handleAuthChange()
    renderFilteredListings()
    showUxToast('Your store has been deleted. Your listings were kept.')
  } catch (e) {
    console.warn('Deleting store failed', e)
    for (const item of restoreFiles) {
      if (!item?.path || !item?.blob) continue
      try {
        const { error: restoreErr } = await storage.upload(item.path, item.blob, {
          upsert: true,
          contentType: item.blob.type || 'image/jpeg'
        })
        if (restoreErr) console.warn('Could not restore store image after failed deletion', restoreErr)
      } catch (restoreErr) {
        console.warn('Could not restore store image after failed deletion', restoreErr)
      }
    }
    const message = e?.message || 'Unknown Supabase error'
    storeManageMsg.innerHTML = `<strong>Could not delete your store.</strong><br><span class="muted">${escapeHtml(message)}</span>`
  } finally {
    if (storeManageDeleteBtn) storeManageDeleteBtn.disabled = false
    storeManageSave?.removeAttribute('disabled')
  }
}

storeManageDeleteBtn?.addEventListener('click', deleteMyStore)

// --- Admin: reported listings review ---
const adminOverlay = document.getElementById('admin-overlay')
const adminClose = document.getElementById('admin-close')
const adminReportsList = document.getElementById('admin-reports-list')

async function openAdminReports() {
  if (!adminOverlay) return
  adminOverlay.classList.remove('hidden')
  adminOverlay.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
  if (adminReportsList) adminReportsList.innerHTML = 'Loading…'

  try {
    const { data, error } = await db.from('reports').select('*').order('created_at', { ascending: false })
    if (error) throw error
    if (!data || !data.length) {
      adminReportsList.innerHTML = '<div class="muted">No reports yet.</div>'
      return
    }
    adminReportsList.innerHTML = data.map((r) => {
      const listing = currentListings.find((l) => String(l.id) === String(r.listing_id))
      const when = r.created_at ? new Date(r.created_at).toLocaleString() : ''
      return `<div class="report-row">
        <div class="report-row-title">${escapeHtml(listing ? listing.title : `Listing #${r.listing_id}`)}</div>
        <div class="report-row-reason">${escapeHtml(r.reason)}</div>
        <div class="report-row-meta muted">Reported by ${escapeHtml(r.reporter_name || 'someone')} — ${escapeHtml(when)}</div>
      </div>`
    }).join('')
  } catch (e) {
    console.warn('Loading reports failed:', e)
    adminReportsList.innerHTML = '<div class="muted">Could not load reports (check that the SQL policy for the reports table has been run).</div>'
  }
}

function closeAdminReports() {
  if (!adminOverlay) return
  adminOverlay.classList.add('hidden')
  adminOverlay.setAttribute('aria-hidden', 'true')
  document.documentElement.classList.remove('lightbox-open')
}

adminClose?.addEventListener('click', closeAdminReports)
adminOverlay?.addEventListener('click', (event) => {
  if (event.target === adminOverlay) closeAdminReports()
})
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
  const emptyClear = ev.target.closest('.empty-clear-btn')
  if (emptyClear) { if (searchEl) searchEl.value = ''; activeCategory = ''; renderCategoryChips(); visibleCount = PAGE_SIZE; renderFilteredListings(); return }
  const emptyPost = ev.target.closest('.empty-post-btn')
  if (emptyPost) { createListingSection?.scrollIntoView({behavior:'smooth', block:'start'}); setTimeout(() => focusListingField(titleEl), 350); return }
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

let ratingsByListing = {}
let myRatingsByListing = {}

// Housekeeping rules: unsold listings auto-expire after 62 days, and sold
// listings are removed 3 days after being marked sold (the seller sees a
// "will be removed on..." notice on their own card before that happens, in
// renderListing, so nothing disappears with no warning). Runs for whichever
// listings the signed-in visitor has delete rights on: their own, or — for
// the site owner — everyone's.
function extractStoragePaths(listing) {
  const urls = getListingImages(listing)
  const paths = []
  for (const value of urls) {
    try {
      const url = new URL(value, window.location.href)
      const marker = '/storage/v1/object/public/listing-images/'
      const idx = url.pathname.indexOf(marker)
      if (idx !== -1) {
        const path = decodeURIComponent(url.pathname.slice(idx + marker.length)).replace(/^\/+/, '')
        if (path) paths.push(path)
      } else if (!/^(blob:|data:)/i.test(String(value)) && !/^https?:/i.test(String(value))) {
        const rawPath = decodeURIComponent(String(value)).replace(/^\/+/, '')
        if (rawPath && !rawPath.includes('storage/v1/')) paths.push(rawPath)
      }
    } catch {
      // A stored relative storage path can still be removed directly.
      const rawPath = String(value || '').replace(/^\/+/, '')
      if (rawPath && !/^https?:|^blob:|^data:/i.test(rawPath)) paths.push(rawPath)
    }
  }
  return [...new Set(paths)]
}

async function deleteListingStorageFiles(listing) {
  if (!useSupabase || !db.storage) return
  const paths = extractStoragePaths(listing)
  if (!paths.length) return
  try {
    const { error } = await db.storage.from('listing-images').remove(paths)
    if (error) throw error
  } catch (e) {
    // Do not block deletion of the database row. The listing is already gone;
    // log the storage failure so it can be fixed without confusing the seller.
    console.warn('Could not remove listing images from Supabase Storage', e)
  }
}

async function runListingCleanup() {
  if (!currentUser || !useSupabase) return
  const isSiteOwner = String(currentUser.email || '').toLowerCase() === OWNER_EMAIL
  const now = Date.now()
  const toDelete = []
  for (const item of currentListings) {
    const owns = isSiteOwner || (item.user_id && String(item.user_id) === String(currentUser.id))
    if (!owns) continue
    if (!item.sold && item.created_at) {
      const ageDays = (now - new Date(item.created_at).getTime()) / 86400000
      if (ageDays >= 62) { toDelete.push(item.id); continue }
    }
    if (item.sold && item.sold_at) {
      const soldAgeDays = (now - new Date(item.sold_at).getTime()) / 86400000
      if (soldAgeDays >= 3) toDelete.push(item.id)
    }
  }
  if (!toDelete.length) return
  try {
    const removedListings = currentListings.filter((item) => toDelete.some((id) => String(id) === String(item.id)))
    const { error } = await db.from('listings').delete().in('id', toDelete)
    if (error) throw error
    for (const item of removedListings) await deleteListingStorageFiles(item)
    currentListings = currentListings.filter((item) => !toDelete.includes(item.id))
  } catch (e) {
    console.warn('Listing cleanup failed', e)
  }
}

async function fetchAndRenderListings() {
  renderSkeletons()
  try {
    // Select all columns to avoid errors if remote schema differs.
    const { data, error } = await db.from('listings').select('*')
    if (error) throw error
    currentListings = data || []
    try {
      const { data: storeRows, error: storeErr } = await db.from('stores').select('*')
      if (!storeErr) storesById = indexStoreRows(storeRows)
    } catch (e) {
      console.warn('Loading stores failed (has the stores table been created?)', e)
    }
    renderCategoryChips()
    window.linkhubApplyStoreDefaults?.()
    try {
      const { data: ratingRows, error: ratingErr } = await db.from('ratings').select('listing_id, rating, rater_id')
      if (!ratingErr) {
        ratingsByListing = {}
        myRatingsByListing = {}
        for (const r of ratingRows || []) {
          const key = String(r.listing_id)
          if (!ratingsByListing[key]) ratingsByListing[key] = { sum: 0, count: 0 }
          ratingsByListing[key].sum += Number(r.rating) || 0
          ratingsByListing[key].count += 1
          if (currentUser && String(r.rater_id) === String(currentUser.id)) myRatingsByListing[key] = Number(r.rating)
        }
      }
    } catch (e) {
      console.warn('Loading ratings failed (has the ratings table been created?)', e)
    }
    await runListingCleanup()
    renderFilteredListings()
    if (myListingsOverlay && !myListingsOverlay.classList.contains('hidden')) renderMyListings()
    if (storeOverlay && !storeOverlay.classList.contains('hidden')) renderStoreListings()
    else openStoreFromUrlIfPresent()
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
  if (heroListingCount) heroListingCount.textContent = currentListings.filter((item) => !item.sold).length
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
    const empty = document.createElement('div')
    empty.className = 'market-empty-state'
    if (currentListings.length === 0) {
      empty.innerHTML = `<div class="market-empty-icon">${ICON_CART}</div><h3>No listings yet</h3><p class="muted">Be the first person to put something up for sale.</p><button type="button" class="hero-btn hero-btn-primary empty-post-btn">Post a listing</button>`
    } else {
      empty.innerHTML = `<div class="market-empty-icon">⌕</div><h3>No matches found</h3><p class="muted">Try another search or clear the current filters.</p><button type="button" class="muted-btn empty-clear-btn">Clear search</button>`
    }
    listingsContainer.appendChild(empty)
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

// --- Carty: conversational marketplace assistant ---
// Carty keeps a short conversation history in localStorage and sends one
// request per user message. It can search listings, answer normal questions,
// compare current marketplace options, and add/remove listings from the cart.
const CARTY_HISTORY_KEY = 'linkhub-carty-history-v1'
const CARTY_HISTORY_LIMIT = 12
let cartyConversation = loadStoredJSON(CARTY_HISTORY_KEY, [])
  .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  .slice(-CARTY_HISTORY_LIMIT)

function persistCartyConversation() {
  cartyConversation = cartyConversation.slice(-CARTY_HISTORY_LIMIT)
  saveStoredJSON(CARTY_HISTORY_KEY, cartyConversation)
}

function addCartyHistory(role, content) {
  const text = String(content || '').trim()
  if (!text) return
  cartyConversation.push({ role, content: text })
  persistCartyConversation()
}

function getCartyCartContext() {
  return cartItems().slice(0, 8).map(item => ({
    id: String(item.id),
    title: String(item.title || ''),
    price: item.price ?? null,
    currency: item.price_currency || item.currency || '',
    category: item.category || '',
    location: item.location || item.city || '',
    condition: item.url || '',
    delivery: item.delivery_type || ''
  }))
}

function getCartyMarketplaceContext() {
  // Prefer the currently displayed/search-relevant listings, then fill with
  // the newest available listings so Carty can still answer broad questions.
  const term = searchEl?.value.trim().toLowerCase() || ''
  const scoped = getScopedListings()
  let relevant = scoped
  if (term) {
    relevant = scoped.filter(item => {
      const haystack = [item.title, item.description, item.category, item.location, item.city, item.url, item.delivery_type]
        .filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }
  const combined = [...relevant, ...scoped.filter(x => !relevant.includes(x))]
  return combined.slice(0, 14).map(item => ({
    id: String(item.id),
    title: String(item.title || ''),
    description: String(item.description || '').slice(0, 220),
    price: item.price ?? null,
    currency: item.price_currency || item.currency || '',
    category: item.category || '',
    location: item.location || item.city || '',
    condition: item.url || '',
    delivery: item.delivery_type || '',
    sold: Boolean(item.sold)
  }))
}

function getCartyContext() {
  return JSON.stringify({
    current_search: {
      text: searchEl?.value.trim() || '',
      category: activeCategory || null,
      result_count: typeof listCount?.textContent === 'string' ? listCount.textContent : ''
    },
    cart: getCartyCartContext(),
    marketplace_listings: getCartyMarketplaceContext()
  })
}

function ensureCartyChatStyle() {
  if (document.getElementById('carty-chat-runtime-style')) return
  const style = document.createElement('style')
  style.id = 'carty-chat-runtime-style'
  style.textContent = `
    #carty-message{display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;scroll-behavior:smooth}
    .carty-chat-row{display:flex;width:100%}
    .carty-chat-row.user{justify-content:flex-end}
    .carty-chat-row.assistant{justify-content:flex-start}
    .carty-chat-bubble{max-width:88%;padding:9px 11px;border-radius:14px;line-height:1.38;white-space:pre-wrap;word-break:break-word}
    .carty-chat-row.user .carty-chat-bubble{background:rgba(255,255,255,.10)}
    .carty-chat-row.assistant .carty-chat-bubble{background:rgba(255,196,0,.10)}
    .carty-chat-typing{opacity:.68;font-style:italic}
  `
  document.head.appendChild(style)
}

function renderCartyHistory() {
  if (!cartyMessage) return
  ensureCartyChatStyle()
  cartyMessage.innerHTML = ''
  for (const msg of cartyConversation) {
    const row = document.createElement('div')
    row.className = `carty-chat-row ${msg.role === 'user' ? 'user' : 'assistant'}`
    const bubble = document.createElement('div')
    bubble.className = 'carty-chat-bubble'
    bubble.textContent = msg.content
    row.appendChild(bubble)
    cartyMessage.appendChild(row)
  }
  cartyMessage.scrollTop = cartyMessage.scrollHeight
}

function appendCartyBubble(role, text, extraClass = '') {
  if (!cartyMessage) return null
  ensureCartyChatStyle()
  if (cartyMessage.dataset.initialGreeting === '1') {
    cartyMessage.innerHTML = ''
    cartyMessage.dataset.initialGreeting = '0'
  }
  const row = document.createElement('div')
  row.className = `carty-chat-row ${role === 'user' ? 'user' : 'assistant'}`
  const bubble = document.createElement('div')
  bubble.className = `carty-chat-bubble ${extraClass}`.trim()
  bubble.textContent = text
  row.appendChild(bubble)
  cartyMessage.appendChild(row)
  cartyMessage.scrollTop = cartyMessage.scrollHeight
  return bubble
}

function setCartyTyping(visible) {
  const existing = cartyMessage?.querySelector('.carty-typing-bubble')
  if (!visible) {
    existing?.closest('.carty-chat-row')?.remove()
    return
  }
  if (existing || !cartyMessage) return
  ensureCartyChatStyle()
  const row = document.createElement('div')
  row.className = 'carty-chat-row assistant'
  const bubble = document.createElement('div')
  bubble.className = 'carty-chat-bubble carty-chat-typing carty-typing-bubble'
  bubble.textContent = 'Thinking…'
  row.appendChild(bubble)
  cartyMessage.appendChild(row)
  cartyMessage.scrollTop = cartyMessage.scrollHeight
}

// When this v20 UI is loaded, preserve the original one-line greeting as the
// first visual message. It becomes a real chat history after the first send.
if (cartyMessage && !cartyConversation.length) cartyMessage.dataset.initialGreeting = '1'
else renderCartyHistory()

function normalizeCartyFilters(data) {
  const filters = data?.filters && typeof data.filters === 'object' ? data.filters : data
  if (!filters || typeof filters !== 'object') return {}
  return {
    keywords: Array.isArray(filters.keywords) ? filters.keywords.filter(Boolean).slice(0, 8) : [],
    category: typeof filters.category === 'string' && filters.category.trim() ? filters.category.trim() : null,
    min_price: Number.isFinite(Number(filters.min_price)) ? Number(filters.min_price) : null,
    max_price: Number.isFinite(Number(filters.max_price)) ? Number(filters.max_price) : null,
    condition: typeof filters.condition === 'string' && filters.condition.trim() ? filters.condition.trim() : null,
    delivery: ['delivery', 'pickup'].includes(filters.delivery) ? filters.delivery : null
  }
}

async function runAiSearch(queryText) {
  const term = String(queryText || '').trim()
  if (!term) return { type: 'chat', reply: 'What are you looking for?' }

  let data
  try {
    const res = await fetch(AI_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        messages: cartyConversation,
        marketplaceContext: getCartyContext()
      })
    })
    if (!res.ok) throw new Error(`AI request failed (${res.status})`)
    data = await res.json()
  } catch (err) {
    console.warn('Carty request failed:', err)
    return {
      type: 'chat',
      reply: 'I’m having trouble reaching my shopping brain right now. Try again in a moment, or use the main search bar.'
    }
  }

  if (data?.type === 'chat') {
    return { type: 'chat', reply: data.reply || 'I’m here to help you shop on LinkHub.' }
  }

  if (data?.type === 'cart_action') {
    const action = data.action === 'remove' ? 'remove' : 'add'
    const listingId = String(data.listing_id || '')
    const item = currentListings.find(x => String(x.id) === listingId)
    if (!item) {
      return { type: 'chat', reply: 'I couldn’t match that item to a current LinkHub listing. Try telling me the item name again.' }
    }
    if (action === 'add') addToCart(listingId)
    else removeFromCart(listingId)
    return {
      type: 'cart_action',
      action,
      listingId,
      reply: data.reply || (action === 'add' ? `Added “${item.title || 'that listing'}” to your cart.` : `Removed “${item.title || 'that listing'}” from your cart.`)
    }
  }

  const filters = normalizeCartyFilters(data)
  let results = applyAiFilters(getScopedListings(), filters)
  if (!results.length) results = smartKeywordSearch(term)

  const displayTerm = pickDisplayTerm(term, filters)
  listingsContainer.innerHTML = ''
  visibleCount = PAGE_SIZE

  if (!results.length) {
    listCount.textContent = '0 listings'
    return {
      type: 'search',
      count: 0,
      displayTerm,
      reply: data.reply || `I couldn’t find a current LinkHub listing that matches “${displayTerm}”.`
    }
  }

  listCount.textContent = `${results.length} listing${results.length === 1 ? '' : 's'}`
  results.slice(0, visibleCount).forEach(item => renderListing(item, listingsContainer))

  return {
    type: 'search',
    count: results.length,
    displayTerm,
    reply: data.reply || `I found ${results.length} listing${results.length === 1 ? '' : 's'} that match what you described.`
  }
}

// --- Carty: AI shopping assistant popup ---
const cartyToggle = document.getElementById('carty-toggle')
const cartyPanel = document.getElementById('carty-panel')
const cartyClose = document.getElementById('carty-close')
const cartyForm = document.getElementById('carty-form')
const cartyInput = document.getElementById('carty-input')
const cartyMic = document.getElementById('carty-mic')
const cartyVoiceToggle = document.getElementById('carty-voice-toggle')

const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition
let cartyVoiceEnabled = localStorage.getItem('carty-voice-enabled') !== '0'
let cartyRecognition = null

function updateCartyVoiceToggleUI() {
  if (!cartyVoiceToggle) return
  cartyVoiceToggle.classList.toggle('muted', !cartyVoiceEnabled)
  cartyVoiceToggle.title = cartyVoiceEnabled ? 'Mute spoken replies' : 'Unmute spoken replies'
}
updateCartyVoiceToggleUI()

function speakCarty(text) {
  if (!cartyVoiceEnabled || !text || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 1.02
    utter.pitch = 1.05
    window.speechSynthesis.speak(utter)
  } catch (e) {
    console.warn('Speech synthesis failed', e)
  }
}

cartyVoiceToggle?.addEventListener('click', () => {
  cartyVoiceEnabled = !cartyVoiceEnabled
  localStorage.setItem('carty-voice-enabled', cartyVoiceEnabled ? '1' : '0')
  updateCartyVoiceToggleUI()
  if (!cartyVoiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel()
})

if (SpeechRecognitionApi && cartyMic) {
  cartyMic.classList.remove('hidden')
  cartyRecognition = new SpeechRecognitionApi()
  cartyRecognition.lang = 'en-ZA'
  cartyRecognition.interimResults = false
  cartyRecognition.maxAlternatives = 1

  cartyRecognition.addEventListener('result', ev => {
    const transcript = ev.results?.[0]?.[0]?.transcript
    if (transcript) {
      cartyInput.value = transcript
      cartyForm?.requestSubmit ? cartyForm.requestSubmit() : cartyForm?.dispatchEvent(new Event('submit', { cancelable: true }))
    }
  })
  cartyRecognition.addEventListener('end', () => cartyMic.classList.remove('listening'))
  cartyRecognition.addEventListener('error', () => cartyMic.classList.remove('listening'))
  cartyMic.addEventListener('click', () => {
    if (cartyMic.classList.contains('listening')) {
      cartyRecognition.stop()
      return
    }
    try {
      cartyMic.classList.add('listening')
      cartyRecognition.start()
    } catch (e) {
      cartyMic.classList.remove('listening')
    }
  })
}

function openCarty() {
  if (!cartyPanel) return
  cartyPanel.classList.remove('hidden')
  cartyPanel.setAttribute('aria-hidden', 'false')
  if (cartyConversation.length) renderCartyHistory()
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

cartyForm?.addEventListener('submit', async ev => {
  ev.preventDefault()
  const term = cartyInput.value.trim()
  if (!term) return

  if (cartyMessage?.dataset.initialGreeting === '1') cartyMessage.dataset.initialGreeting = '0'
  addCartyHistory('user', term)
  appendCartyBubble('user', term)
  setCartyTyping(true)

  cartyInput.disabled = true
  const result = await runAiSearch(term)
  cartyInput.disabled = false
  cartyInput.value = ''
  cartyInput.focus()
  setCartyTyping(false)

  const reply = result.reply || (result.type === 'search'
    ? `Found ${result.count} listing${result.count === 1 ? '' : 's'} for “${result.displayTerm}”.`
    : 'I’m here to help.')
  addCartyHistory('assistant', reply)
  appendCartyBubble('assistant', reply)
  speakCarty(reply)

  if (result.type === 'search' && result.count > 0) {
    document.getElementById('feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})

// Carty intentionally opens only when the user taps the button.

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
  const ratingInfo = ratingsByListing[String(l.id)]
  if (ratingInfo && ratingInfo.count > 0) {
    const avg = ratingInfo.sum / ratingInfo.count
    const full = Math.round(avg)
    const stars = ICON_STAR_FILLED.repeat(full) + ICON_STAR_OUTLINE.repeat(5 - full)
    parts.push(`<div class="listing-rating"><span class="listing-rating-stars">${stars}</span><span class="listing-rating-count">${avg.toFixed(1)} (${ratingInfo.count})</span></div>`)
  }
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
    const link = buildContactLink(l.contact_method, l.contact_details)
    const contactHtml = link
      ? `<a class="contact-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener" data-track-view-id="${escapeHtml(l.id)}">${escapeHtml(link.label)}</a>`
      : `${method} ${details}`
    meta.push(`<div><strong>Contact:</strong> ${contactHtml}</div>`)
  }
  if (meta.length) parts.push(`<div class="listing-meta">${meta.join('\n')}</div>`)
  if (l.description) parts.push(`<p class="listing-desc" data-desc-id="${escapeHtml(l.id)}">${escapeHtml(l.description)}</p><button class="read-more-btn" data-desc-id="${escapeHtml(l.id)}" type="button" style="display:none">Read more</button>`)
  if (l.created_at) {
    try {
      const when = new Date(l.created_at).toLocaleString()
      parts.push(`<div class="muted listing-posted">Posted: ${escapeHtml(when)}</div>`)
    } catch (e) {
      parts.push(`<div class="muted listing-posted">Posted: ${escapeHtml(l.created_at)}</div>`)
    }
  }

  const isOwner = currentUser && l.user_id && l.user_id === currentUser.id
  const isSiteOwner = currentUser && String(currentUser.email || '').toLowerCase() === OWNER_EMAIL
  const isFavorited = favoritedIds.has(l.id)
  if (isOwner) {
    parts.push(`<div class="listing-actions" style="margin-top:10px">
      <button class="edit-btn" data-id="${escapeHtml(l.id)}" type="button">Edit</button>
      <button class="sold-btn" data-id="${escapeHtml(l.id)}" data-sold="${l.sold ? '1' : '0'}" type="button">${l.sold ? 'Available' : 'Sold'}</button>
      <button class="delete-btn" data-id="${escapeHtml(l.id)}" type="button">Delete</button>
      <button class="share-btn" data-id="${escapeHtml(l.id)}" type="button">Share</button>
    </div>`)
  } else {
    parts.push(`<div class="listing-actions" style="margin-top:10px">
      <button class="favorite-btn${isFavorited ? ' active' : ''}" data-id="${escapeHtml(l.id)}" type="button">${isFavorited ? `${ICON_STAR_FILLED} Saved` : `${ICON_STAR_OUTLINE} Save`}</button>
      <button class="cart-btn${cartHas(l.id) ? ' active' : ''}" data-id="${escapeHtml(l.id)}" type="button">${cartHas(l.id) ? `${ICON_CART} In Cart` : `${ICON_CART} Add to Cart`}</button>
      <button class="offer-btn" data-id="${escapeHtml(l.id)}" type="button">Make Offer</button>
      <button class="share-btn" data-id="${escapeHtml(l.id)}" type="button">Share</button>
      <button class="report-btn" data-id="${escapeHtml(l.id)}" type="button">Report</button>
    </div>`)
    if (currentUser) {
      const myRating = myRatingsByListing[String(l.id)]
      parts.push(`<div class="rate-row" data-rate-id="${escapeHtml(l.id)}">
        <span class="rate-label">${myRating ? 'Your rating:' : 'Rate this:'}</span>
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="rate-star${myRating >= n ? ' active' : ''}" data-id="${escapeHtml(l.id)}" data-value="${n}" aria-label="Rate ${n} star${n === 1 ? '' : 's'}">${myRating >= n ? ICON_STAR_FILLED : ICON_STAR_OUTLINE}</button>`).join('')}
      </div>`)
    }
    if (isSiteOwner) {
      parts.push(`<button class="delete-btn admin-delete-btn" data-id="${escapeHtml(l.id)}" type="button">${ICON_SHIELD} Admin: Delete Listing</button>`)
    }
  }

  if (l.user_id && !isOwner) {
    const s = storesById[String(l.user_id)]
    if (s?.name) {
      parts.push(`<button class="visit-store-btn" data-store-id="${escapeHtml(l.user_id)}" type="button">${ICON_STORE} Visit Store: ${escapeHtml(s.name)}</button>`)
    }
  }

  if (isOwner) {
    const ageDays = l.created_at ? Math.floor((Date.now() - new Date(l.last_confirmed_at || l.created_at).getTime()) / 86400000) : 0
    if (!l.sold && ageDays >= 14) {
      parts.push(`<div class="stale-nudge">Posted ${ageDays} days ago — <button class="confirm-available-btn" data-id="${escapeHtml(l.id)}" type="button">Still available?</button></div>`)
    }
    if (!l.sold && l.created_at) {
      const daysLeft = 62 - Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400000)
      if (daysLeft <= 7 && daysLeft > 0) {
        parts.push(`<div class="stale-nudge">This listing will be automatically removed in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (62-day limit).</div>`)
      }
    }
    if (l.sold && l.sold_at) {
      const soldAgeDays = (Date.now() - new Date(l.sold_at).getTime()) / 86400000
      const daysLeft = Math.ceil(3 - soldAgeDays)
      if (daysLeft > 0) {
        parts.push(`<div class="stale-nudge">Marked sold — this listing will be automatically removed in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.</div>`)
      }
    }
  }
  d.innerHTML = parts.join('\n')
  container.appendChild(d)

  const descEl = d.querySelector('.listing-desc')
  const readMoreBtn = d.querySelector('.read-more-btn')
  if (descEl && readMoreBtn) {
    // Character-count fallback: works even if the card is rendered while
    // hidden (e.g. inside an overlay that's not open yet), where
    // scrollHeight/clientHeight would both read 0 and the check below
    // would silently fail to show the button.
    const likelyTruncated = (l.description || '').length > 140
    if (likelyTruncated) {
      readMoreBtn.style.display = ''
    }
    // Also do a layout-based check once the card is actually visible,
    // in case CSS wraps to more/fewer than 2 lines than the char-count
    // guess assumes.
    requestAnimationFrame(() => {
      if (descEl.scrollHeight > descEl.clientHeight + 1) {
        readMoreBtn.style.display = ''
      } else if (!likelyTruncated) {
        readMoreBtn.style.display = 'none'
      }
    })
  }
}

document.body.addEventListener('click', (ev) => {
  const storeBtn = ev.target.closest('.visit-store-btn')
  if (storeBtn) {
    openStore(storeBtn.dataset.storeId)
    return
  }
  const cartBtn = ev.target.closest('.cart-btn')
  if (cartBtn) {
    const id = cartBtn.dataset.id
    if (cartHas(id)) { removeFromCart(id); showUxToast('Removed from cart.'); } else addToCart(id)
    return
  }
  const readBtn = ev.target.closest('.read-more-btn')
  if (readBtn) {
    const id = readBtn.dataset.descId
    const desc = document.querySelector(`.listing-desc[data-desc-id="${CSS.escape(id)}"]`)
    if (!desc) return
    const expanded = desc.classList.toggle('expanded')
    readBtn.textContent = expanded ? 'Show less' : 'Read more'
    return
  }
  const waLink = ev.target.closest('[data-track-view-id]')
  if (waLink) {
    const item = currentListings.find((r) => String(r.id) === String(waLink.dataset.trackViewId))
    if (item) trackListingView(item)
  }
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
  if (mainBtn) {
    openLightbox(images[index] || images[0])
    if (item) trackListingView(item)
  }
})

async function trackListingView(item) {
  if (!item?.id || !useSupabase) return
  if (currentUser?.id && item.user_id && String(currentUser.id) === String(item.user_id)) return
  const key = `viewed-listing-${item.id}-${currentUser?.id || 'anon'}`
  if (localStorage.getItem(key)) return
  localStorage.setItem(key, '1')
  try {
    const { data } = await db.rpc('increment_listing_view', { listing_id: item.id })
    const count = Number(data)
    if (Number.isFinite(count)) document.querySelector(`[data-view-id="${CSS.escape(String(item.id))}"]`)?.replaceChildren(document.createTextNode(`${count} view${count === 1 ? '' : 's'} so far`))
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
const cartyMic = document.getElementById('carty-mic')
const cartyVoiceToggle = document.getElementById('carty-voice-toggle')

// Give Carty a voice: speaks replies aloud (toggleable) and accepts spoken
// input via the mic button, using the browser's built-in Web Speech API —
// no extra service or API key needed.
const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition
let cartyVoiceEnabled = localStorage.getItem('carty-voice-enabled') !== '0'
let cartyRecognition = null

function updateCartyVoiceToggleUI() {
  if (!cartyVoiceToggle) return
  cartyVoiceToggle.classList.toggle('muted', !cartyVoiceEnabled)
  cartyVoiceToggle.title = cartyVoiceEnabled ? 'Mute spoken replies' : 'Unmute spoken replies'
}
updateCartyVoiceToggleUI()

function speakCarty(text) {
  if (!cartyVoiceEnabled || !text || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 1.02
    utter.pitch = 1.05
    window.speechSynthesis.speak(utter)
  } catch (e) {
    console.warn('Speech synthesis failed', e)
  }
}

cartyVoiceToggle?.addEventListener('click', () => {
  cartyVoiceEnabled = !cartyVoiceEnabled
  localStorage.setItem('carty-voice-enabled', cartyVoiceEnabled ? '1' : '0')
  updateCartyVoiceToggleUI()
  if (!cartyVoiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel()
})

if (SpeechRecognitionApi && cartyMic) {
  cartyMic.classList.remove('hidden')
  cartyRecognition = new SpeechRecognitionApi()
  cartyRecognition.lang = 'en-ZA'
  cartyRecognition.interimResults = false
  cartyRecognition.maxAlternatives = 1

  cartyRecognition.addEventListener('result', (ev) => {
    const transcript = ev.results?.[0]?.[0]?.transcript
    if (transcript) {
      cartyInput.value = transcript
      cartyForm?.requestSubmit ? cartyForm.requestSubmit() : cartyForm?.dispatchEvent(new Event('submit', { cancelable: true }))
    }
  })
  cartyRecognition.addEventListener('end', () => cartyMic.classList.remove('listening'))
  cartyRecognition.addEventListener('error', () => cartyMic.classList.remove('listening'))

  cartyMic.addEventListener('click', () => {
    if (cartyMic.classList.contains('listening')) {
      cartyRecognition.stop()
      return
    }
    try {
      cartyMic.classList.add('listening')
      cartyRecognition.start()
    } catch (e) {
      cartyMic.classList.remove('listening')
    }
  })
}

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
    speakCarty(result.reply)
    return
  }

  if (result.count > 0) {
    const msg = `Found ${result.count} listing${result.count === 1 ? '' : 's'} for "${result.displayTerm}" 🛒 Want to search for something else?`
    cartyMessage.textContent = msg
    speakCarty(`Found ${result.count} listing${result.count === 1 ? '' : 's'} for ${result.displayTerm}.`)
    document.getElementById('feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else {
    const msg = `There's no one selling "${result.displayTerm}" at the moment.`
    cartyMessage.textContent = msg
    speakCarty(msg)
  }
})

// Theme (light/dark) — applied immediately so there's no flash of the wrong theme
const themeToggleBtn = document.getElementById('theme-toggle-btn')
function applyTheme(theme) {
  document.documentElement.classList.toggle('light-theme', theme === 'light')
  if (themeToggleBtn) {
    themeToggleBtn.classList.toggle('is-light', theme === 'light')
    const label = themeToggleBtn.querySelector('.theme-toggle-label')
    if (label) label.textContent = theme === 'light' ? 'Light' : 'Dark'
  }
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


// Install prompt: a top-of-screen popup instead of a permanent header
// button. Shows at most 3 times total across visits, then never again
// (whether or not the person actually installed it).
const INSTALL_PROMPT_MAX_SHOWS = 3
let deferredInstallPrompt = null

function showInstallBanner() {
  if (document.getElementById('install-banner')) return
  const shownCount = Number(localStorage.getItem('install-prompt-shown-count') || '0')
  if (shownCount >= INSTALL_PROMPT_MAX_SHOWS) return
  localStorage.setItem('install-prompt-shown-count', String(shownCount + 1))

  const banner = document.createElement('div')
  banner.id = 'install-banner'
  banner.className = 'install-banner'
  banner.innerHTML = `
    <span class="install-banner-text">Install LinkHub for faster access</span>
    <div class="install-banner-actions">
      <button id="install-banner-yes" type="button">Install</button>
      <button id="install-banner-no" type="button" aria-label="Dismiss">&times;</button>
    </div>
  `
  document.body.appendChild(banner)
  requestAnimationFrame(() => banner.classList.add('visible'))

  document.getElementById('install-banner-yes').addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt()
      await deferredInstallPrompt.userChoice.catch(() => null)
      deferredInstallPrompt = null
    }
    dismissInstallBanner()
  })
  document.getElementById('install-banner-no').addEventListener('click', dismissInstallBanner)
}

function dismissInstallBanner() {
  const banner = document.getElementById('install-banner')
  if (!banner) return
  banner.classList.remove('visible')
  setTimeout(() => banner.remove(), 300)
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredInstallPrompt = event
  showInstallBanner()
})
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null
  // Stop ever prompting again once actually installed.
  localStorage.setItem('install-prompt-shown-count', String(INSTALL_PROMPT_MAX_SHOWS))
  dismissInstallBanner()
  buildDrawerMenu()
  buildDesktopNav()
})

// Carty opens only when the user taps the Carty button.

// Create Listing: direct typing only. Real textareas wrap down and grow with the content.
(() => {
  const section = document.getElementById('create-listing-section')
  if (!section) return

  const editors = Array.from(section.querySelectorAll('textarea.direct-grow-editor, textarea#description'))

  const growTextarea = (editor) => {
    // Reset first so shrinking also works, then size to the content immediately.
    editor.style.height = '0px'
    editor.style.height = `${Math.max(44, editor.scrollHeight)}px`
  }

  editors.forEach((editor) => {
    const hiddenId = editor.id.replace(/-editor$/, '')
    const hidden = document.getElementById(hiddenId)

    const sync = () => {
      if (hidden) hidden.value = editor.value
      growTextarea(editor)
    }

    editor.addEventListener('input', sync)
    editor.addEventListener('focus', () => growTextarea(editor))
    editor.addEventListener('blur', sync)

    if (hidden && hidden.value && !editor.value) editor.value = hidden.value
    growTextarea(editor)
  })
})()



// --- UX psychology layer (v20 base) ---------------------------------------
// These enhancements apply the useful, ethical ideas from the referenced UX
// video: reduce decision fatigue, show real progress, give value before signup,
// and let users feel ownership while building something.
(function initUxPsychologyLayer() {
  const listingProgressFill = document.getElementById('listing-progress-fill')
  const listingProgressLabel = document.getElementById('listing-progress-label')
  const listingProgressCount = document.getElementById('listing-progress-count')
  const listingProgressSteps = document.querySelectorAll('#listing-progress .ux-progress-steps span')
  const categorySuggestions = document.getElementById('category-suggestions')
  const titleEditor = document.getElementById('title-editor')
  const categoryEditor = document.getElementById('category-editor')

  const suggestionMap = [
    ['phone|iphone|samsung|android|galaxy|mobile', 'Phones'],
    ['tv|television|smart tv|decoder|tv box', 'TV & TV Boxes'],
    ['speaker|headphone|earbud|audio|soundbar', 'Audio'],
    ['laptop|computer|pc|monitor|keyboard|mouse', 'Computers'],
    ['chair|table|couch|sofa|desk|bed|furniture', 'Furniture'],
    ['shoe|shirt|dress|jacket|clothing|fashion', 'Clothing'],
    ['car|vehicle|bike|motorcycle|toyota|ford|volkswagen', 'Vehicles'],
    ['game|playstation|xbox|nintendo|controller', 'Gaming'],
    ['fridge|refrigerator|microwave|stove|appliance', 'Appliances']
  ]

  function updateListingProgress() {
    if (!listingProgressFill) return
    const titleDone = !!(titleEl?.value || titleEditor?.value).trim()
    const priceDone = !!String(priceEl?.value || '').trim()
    const categoryDone = !!(categoryEl?.value || categoryEditor?.value).trim()
    const detailDone = !!String(descEl?.value || '').trim() || !!imageEl?.files?.length || !!String(locationEl?.value || '').trim()
    const done = [titleDone, priceDone, categoryDone, detailDone]
    const count = done.filter(Boolean).length
    const phase = count >= 4 ? 4 : Math.max(1, count + 1)
    const fill = [24, 48, 72, 88, 100][Math.min(4, count)]
    const labels = [
      'Start with the basics',
      'Nice — keep going',
      'Your listing is taking shape',
      'Almost ready to publish',
      'Ready to publish'
    ]
    listingProgressFill.style.width = `${fill}%`
    if (listingProgressLabel) listingProgressLabel.textContent = labels[count]
    if (listingProgressCount) listingProgressCount.textContent = `Step ${phase} of 4`
    listingProgressSteps.forEach((el, index) => el.classList.toggle('active', index < phase))
  }

  function renderCategorySuggestions() {
    if (!categorySuggestions) return
    const text = String(titleEditor?.value || titleEl?.value || '').toLowerCase().trim()
    if (!text || String(categoryEditor?.value || categoryEl?.value || '').trim()) {
      categorySuggestions.innerHTML = ''
      return
    }
    const matches = suggestionMap.filter(([terms]) => terms.split('|').some(term => text.includes(term))).slice(0, 3)
    if (!matches.length) {
      categorySuggestions.innerHTML = ''
      return
    }
    categorySuggestions.innerHTML = matches.map(([, label]) => `<button type="button" class="category-suggestion" data-category-suggestion="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join('')
  }

  categorySuggestions?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-category-suggestion]')
    if (!btn) return
    const value = btn.dataset.categorySuggestion || ''
    if (categoryEditor) {
      categoryEditor.value = value
      categoryEditor.dispatchEvent(new Event('input', { bubbles: true }))
      categoryEditor.focus()
    } else if (categoryEl) {
      categoryEl.value = value
      categoryEl.dispatchEvent(new Event('input', { bubbles: true }))
    }
    renderCategorySuggestions()
    updateListingProgress()
    showUxToast(`Category set to ${value}.`)
  })

  ;[titleEditor, categoryEditor, priceEl, descEl, imageEl, locationEl].forEach((el) => {
    el?.addEventListener('input', () => {
      updateListingProgress()
      if (el === titleEditor) renderCategorySuggestions()
    })
    el?.addEventListener('change', updateListingProgress)
  })

  // Smart defaults: when a seller already has a business storefront, reuse
  // information they already supplied instead of making them type it again.
  window.linkhubApplyStoreDefaults = function linkhubApplyStoreDefaults() {
    if (!currentUser) return
    const store = storesById[String(currentUser.id)]
    if (!store) return
    const storeCategory = String(store.category || '').trim()
    const storePhone = String(store.phone || '').trim()
    const storeLocation = String(store.location || '').trim()
    if (storeCategory && categoryEditor && !categoryEditor.value.trim()) {
      categoryEditor.value = storeCategory
      categoryEditor.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (storePhone && contactDetailsEl && !contactDetailsEl.value.trim()) {
      contactDetailsEl.value = storePhone
      const contactEditor = document.getElementById('contact-details-editor')
      if (contactEditor) {
        contactEditor.value = storePhone
        contactEditor.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    if (storePhone && contactMethodEl && !contactMethodEl.value) contactMethodEl.value = 'Phone'
    if (storeLocation && locationEl && !locationEl.value.trim()) {
      const locationEditor = document.getElementById('location-editor')
      locationEl.value = storeLocation
      if (locationEditor) {
        locationEditor.value = storeLocation
        locationEditor.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    updateListingProgress()
  }

  // Store setup: show real progress and a live, lightweight ownership summary.
  const storeProgressFill = document.getElementById('store-progress-fill')
  const storeProgressLabel = document.getElementById('store-progress-label')
  const storeProgressCount = document.getElementById('store-progress-count')
  const storeProgressSteps = document.querySelectorAll('#store-progress .ux-progress-steps span')
  const storeSummaryName = document.getElementById('store-summary-name')
  const storeSummaryMeta = document.getElementById('store-summary-meta')
  const storeSummaryComplete = document.getElementById('store-summary-complete')

  function updateStoreProgress() {
    if (!storeProgressFill) return
    const nameDone = !!String(storeManageName?.value || '').trim()
    const businessDone = !!String(storeManageCategory?.value || '').trim() || !!String(storeManagePhone?.value || '').trim() || !!String(storeManageLocation?.value || '').trim()
    const brandingDone = !!(storeManageLogo?.files?.length || storeManageBanner?.files?.length || storeManageLogoPreview?.src || storeManageBannerPreview?.src)
    const saved = !!getStoreForUser(currentUser?.id || '')?.name
    const stages = [nameDone, businessDone, brandingDone, saved]
    const count = stages.filter(Boolean).length
    const phase = Math.max(1, Math.min(4, count + 1))
    const fill = [24, 50, 75, 90, 100][Math.min(4, count)]
    const labels = ['Build your storefront', 'Add your business details', 'Make it yours', 'Your store is live', 'Ready to share']
    storeProgressFill.style.width = `${fill}%`
    if (storeProgressLabel) storeProgressLabel.textContent = labels[count]
    if (storeProgressCount) storeProgressCount.textContent = `${Math.min(4, phase)} of 4`
    storeProgressSteps.forEach((el, index) => el.classList.toggle('active', index < phase))

    if (storeSummaryName) storeSummaryName.textContent = String(storeManageName?.value || '').trim() || 'Your store name'
    const bits = [
      String(storeManageCategory?.value || '').trim(),
      String(storeManageLocation?.value || '').trim(),
      String(storeManagePhone?.value || '').trim()
    ].filter(Boolean)
    if (storeSummaryMeta) storeSummaryMeta.textContent = bits.join(' • ') || 'Add a name and category to get started.'
    if (storeSummaryComplete) storeSummaryComplete.textContent = `${Math.min(8, [nameDone, !!String(storeManageCategory?.value || '').trim(), !!String(storeManagePhone?.value || '').trim(), !!String(storeManageLocation?.value || '').trim(), !!String(storeManageAddress?.value || '').trim(), !!String(storeManageBio?.value || '').trim(), !!String(storeManageHours?.value || '').trim(), !!String(storeManageFulfilment?.value || '').trim()].filter(Boolean).length)} of 8`
  }

  ;[storeManageName, storeManageCategory, storeManagePhone, storeManageLocation, storeManageAddress, storeManageBio, storeManageHours, storeManageFulfilment].forEach((el) => el?.addEventListener('input', updateStoreProgress))
  ;[storeManageLogo, storeManageBanner].forEach((el) => el?.addEventListener('change', updateStoreProgress))

  window.linkhubRefreshStoreUx = updateStoreProgress
  // Keep the existing no-signup browsing/cart flow as the reciprocity piece.
  updateListingProgress()
  updateStoreProgress()
})()
