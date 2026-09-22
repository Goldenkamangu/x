// database-connector.js is a saved copy of the official Supabase library: the code that lets this app talk to
// the Supabase database (log in, listings, photos, chats, live updates). It is our own file instead of a
// download from the internet, so the app can start with no connection once it has been opened before.
// Keep database-connector.js in the same folder as this file. See DATABASE-CONNECTOR-README.md.
import { createClient } from './database-connector.js'

// Tells the loading screen's safety net (in index.html) that this file really started.
window.__linkhubBooted = true

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

// Storage bucket names. Listing photos and store banners/logos live in
// separate Supabase Storage buckets so store branding doesn't count against
// (or get mixed into) the listing-photos bucket's storage. Update these two
// values if you rename or re-create either bucket in Supabase — every
// upload/delete/cleanup call in this file reads from here rather than
// hardcoding the bucket name.
const LISTING_IMAGES_BUCKET = 'listing-images'
const STORE_ASSETS_BUCKET = 'store-assets'

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
const AI_SEARCH_URL = `${SUPABASE_URL}/functions/v1/LinkHub-Carty`

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
const ICON_CARTY_AI = '<svg class="icon carty-ai-svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false" width="26" height="26"><path d="M5 6h3l1.7 11.1a2.5 2.5 0 0 0 2.5 2.1h8.1a2.5 2.5 0 0 0 2.4-1.9L25 11H9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13" cy="24.3" r="1.8" fill="currentColor"/><circle cx="22.4" cy="24.3" r="1.8" fill="currentColor"/><path d="M24 3.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9zM29 9.2l.45 1.15 1.15.45-1.15.45-.45 1.15-.45-1.15-1.15-.45 1.15-.45z" fill="currentColor"/></svg>'
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

// Mobile: the create-listing card collapses to a slim "+ Post a Listing" bar when nothing is being
// typed, so it doesn't take up space while someone is just browsing. It opens back up whenever a "Post a
// Listing" / "Sell" button is tapped, or when editing an existing listing starts.
const createListingCollapsedBar = document.getElementById('create-listing-collapsed-bar')
const createListingCollapseBtn = document.getElementById('create-listing-collapse-btn')
const CREATE_LISTING_MOBILE_WIDTH = 900

function isCreateListingMobile() { return window.innerWidth <= CREATE_LISTING_MOBILE_WIDTH }

function setCreateListingCollapsed(collapsed) {
  if (!createListingSection) return
  createListingSection.classList.toggle('listing-collapsed', collapsed)
  createListingCollapsedBar?.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
}

function openCreateListingSection({ focus = true } = {}) {
  if (!currentUser || !createListingSection) {
    authSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  setCreateListingCollapsed(false)
  createListingSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (focus) setTimeout(() => focusListingField(titleEl), 350)
}

// A typed title/price/description means there's something to lose, so a resize or reload never
// auto-collapses a form someone is partway through — only the actions below do.
function createListingHasContent() {
  return !!((titleEl?.value || '').trim() || (priceEl?.value || '').trim() || (descriptionEl?.value || '').trim())
}

function collapseCreateListingIfIdle() {
  if (!createListingSection || !isCreateListingMobile()) return
  if (createListingSection.classList.contains('create-listing-editing')) return
  if (createListingHasContent()) return
  setCreateListingCollapsed(true)
}

createListingCollapsedBar?.addEventListener('click', () => openCreateListingSection())
createListingCollapseBtn?.addEventListener('click', () => setCreateListingCollapsed(true))

heroCtaSell?.addEventListener('click', () => openCreateListingSection())
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
const mobileNavUser = document.getElementById('mobile-nav-user')
let navScrollTimer = null

function openDrawer() {
  document.querySelector('.mobile-bottom-nav')?.classList.add('nav-hidden')
  clearTimeout(navScrollTimer)
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
  document.querySelector('.mobile-bottom-nav')?.classList.remove('nav-hidden')
  if (!navDrawer) return
  navDrawer.classList.remove('open')
  navDrawer.setAttribute('aria-hidden', 'true')
  navDrawerBackdrop?.style.setProperty('opacity', '0')
  setTimeout(() => navDrawerBackdrop?.classList.add('hidden'), 200)
  navHamburger?.setAttribute('aria-expanded', 'false')
  navHamburger?.classList.remove('drawer-is-open')
  document.documentElement.classList.remove('lightbox-open')
}
navHamburger?.addEventListener('click', () => {
  if (navDrawer?.classList.contains('open')) closeDrawer()
  else openDrawer()
})
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
      { icon: '<svg class=\"icon\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" aria-hidden=\"true\"><path d=\"M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M10 21h4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"/></svg>', label: 'Notifications', action: () => openNotifications() },
      { icon: ICON_LISTINGS, label: 'My Listings', action: () => openMyListings() },
      { icon: ICON_CART, label: 'My Cart', action: () => openCart() },
      { icon: ICON_STORE, label: hasStore ? 'My Store' : 'Open a Store', action: () => openStoreManage() },
      { icon: dashboardIcon(), label: 'Dashboard', action: () => openDashboard() },
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
const mobileBottomNav = document.getElementById('mobile-bottom-nav')

// Mobile bottom navigation: keep it visible while the user is at rest,
// hide it while scrolling down to give the content more room, and bring it
// back when scrolling up. It also stays hidden while Carty/overlays are open.
if (mobileBottomNav) {
  let lastScrollY = Math.max(0, window.scrollY || 0)
  let scrollTimer = null

  const isBlockingOverlayOpen = () => {
    const cartyOpen = !document.getElementById('carty-panel')?.classList.contains('hidden')
    const lightboxOpen = document.documentElement.classList.contains('lightbox-open')
    const actionOpen = !document.getElementById('linkhub-action-modal')?.classList.contains('hidden')
    const drawerOpen = navDrawer?.classList.contains('open')
    return cartyOpen || lightboxOpen || actionOpen || drawerOpen
  }

  const updateMobileNavVisibility = () => {
    const y = Math.max(0, window.scrollY || 0)
    const delta = y - lastScrollY

    if (isBlockingOverlayOpen()) {
      mobileBottomNav.classList.add('nav-hidden')
    } else if (delta > 8 && y > 80) {
      mobileBottomNav.classList.add('nav-hidden')
    } else if (delta < -8 || y <= 80) {
      mobileBottomNav.classList.remove('nav-hidden')
    }

    lastScrollY = y
    clearTimeout(scrollTimer)
    scrollTimer = window.setTimeout(() => {
      if (!isBlockingOverlayOpen()) mobileBottomNav.classList.remove('nav-hidden')
    }, 900)
  }

  window.addEventListener('scroll', updateMobileNavVisibility, { passive: true })
  window.addEventListener('resize', updateMobileNavVisibility, { passive: true })
}

function setMobileNavActive(name) {
  mobileBottomNav?.querySelectorAll('.mobile-nav-item').forEach((button) => {
    const active = button.dataset.mobileNav === name
    button.classList.toggle('is-active', active)
    if (active) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  })
}

mobileBottomNav?.addEventListener('click', (event) => {
  const button = event.target.closest('.mobile-nav-item')
  if (!button) return
  const action = button.dataset.mobileNav

  // The drawer must never remain over the destination the user just selected.
  // Any bottom-nav action other than Menu closes the drawer first.
  if (action !== 'menu' && navDrawer?.classList.contains('open')) {
    closeDrawer()
  }

  setMobileNavActive(action)

  if (action === 'browse') {
    requestAnimationFrame(() => {
      document.getElementById('feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  } else if (action === 'sell') {
    requestAnimationFrame(() => openCreateListingSection())
  } else if (action === 'cart') {
    // Let the drawer's closing transition begin before opening the cart overlay.
    requestAnimationFrame(() => openCart())
  } else if (action === 'menu') {
    if (navDrawer?.classList.contains('open')) closeDrawer()
    else openDrawer()
  }
})

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

function isInAppBrowser() {
  // WhatsApp/Facebook/Instagram/Messenger/Twitter open links in an embedded
  // webview with no browser chrome. That lack of chrome can make
  // `display-mode: standalone` report true even though nothing is installed,
  // and these webviews can't install PWAs at all — the user has to leave
  // them and open the page in a real browser first.
  const ua = navigator.userAgent || ''
  return /FBAN|FBAV|FB_IAB|Instagram|Messenger|WhatsApp|Line\/|Twitter/i.test(ua)
}

function promptInstall() {
  if (isInAppBrowser()) {
    showInstallInstructions?.(true)
    return
  }

  // If LinkHub is already running as an installed PWA, don't show an install prompt.
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  if (standalone) {
    showUxToast?.('LinkHub is already installed.')
    return
  }

  if (!window.isSecureContext) {
    showInstallInstructions?.(false, 'secure')
    return
  }

  if (deferredInstallPrompt) {
    try {
      const promptEvent = deferredInstallPrompt
      deferredInstallPrompt = null
      Promise.resolve(promptEvent.prompt()).catch(() => {})
      Promise.resolve(promptEvent.userChoice).catch(() => null)
        .finally(() => dismissInstallBanner())
      return
    } catch (err) {
      console.warn('Native install prompt failed:', err)
      deferredInstallPrompt = null
    }
  }

  // Some mobile browsers (including iOS Safari) do not expose
  // beforeinstallprompt. Give the user useful, user-invoked instructions instead
  // of making the Install button appear to do nothing.
  showInstallInstructions?.()
}

function showInstallInstructions(inApp = false, reason = '') {
  // No automatic popup: only a small, user-triggered notice when installation instructions are actually needed.
  const existing = document.getElementById('install-help')
  if (existing) existing.remove()
  const box = document.createElement('div')
  box.id = 'install-help'
  box.className = 'install-help'
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isAndroid = /android/i.test(navigator.userAgent)
  const instruction = reason === 'secure'
    ? 'Install is available when LinkHub is opened over HTTPS. Open the secure site address, then use your browser menu to install it.'
    : inApp
    ? (isIOS
        ? 'This link opened inside another app. Tap <strong>···</strong> or the share icon and choose <strong>Open in Safari</strong>, then use Share → <strong>Add to Home Screen</strong>.'
        : 'This link opened inside another app. Tap <strong>⋮</strong> and choose <strong>Open in Chrome</strong> (or your browser), then use the browser menu to install.')
    : isIOS
      ? 'Use Safari’s Share button, then choose <strong>Add to Home Screen</strong>.'
      : isAndroid
        ? 'Use your browser menu, then choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.'
        : 'Use your browser menu and choose <strong>Install LinkHub</strong> or <strong>Add to Home Screen</strong>.'
  box.innerHTML = `<span>${instruction}</span><button type="button" aria-label="Close">&times;</button>`
  document.body.appendChild(box)
  box.querySelector('button')?.addEventListener('click', () => box.remove())
  setTimeout(() => box.remove(), inApp ? 9000 : 6500)
}

function updateCartCounts() {
  const count = cartIds.size
  document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = count ? `(${count})` : '' })
  document.querySelectorAll('[data-mobile-cart-count]').forEach(el => { el.textContent = count ? String(count) : '' })
}

function updateMobileNavUser() {
  navNotificationsBtn?.classList.toggle('hidden', !currentUser)
  navNotificationsBtn?.setAttribute('aria-hidden', currentUser ? 'false' : 'true')
  if (!mobileNavUser) return
  if (!currentUser) {
    mobileNavUser.innerHTML = ''
    return
  }
  const rawDisplayName = currentUser.user_metadata?.full_name || getDisplayNameFromEmail(currentUser.email)
  const displayName = rawDisplayName.trim().split(/\s+/).filter(Boolean)[0] || 'Account'
  mobileNavUser.innerHTML = `<span class="nav-user-dot" aria-hidden="true"></span>${escapeHtml(displayName)}`
}

// Account menu on wide screens: the everyday actions stay in the bar, the rest live in one dropdown.
var navMenuListenersReady = false

function navMenuIcon(name) {
  const paths = {
    listings: 'M4 6h16M4 12h16M4 18h10',
    store: 'M3 9l1.6-5h14.8L21 9M4 9v11h16V9M9.5 20v-6h5v6',
    dashboard: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0',
    reports: 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6',
    install: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
    terms: 'M7 3h10v18H7zM10 8h4M10 12h4M10 16h3',
    logout: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
  }
  return `<svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="${paths[name] || paths.account}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

function setNavMenuOpen(open, focusTrigger = false) {
  const wrap = document.querySelector('.nav-menu-wrap')
  if (!wrap) return
  const trigger = wrap.querySelector('.nav-user-btn')
  const menu = wrap.querySelector('.nav-menu')
  if (!trigger || !menu) return
  menu.classList.toggle('hidden', !open)
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
  if (!open && focusTrigger) trigger.focus()
}

function navMenuIsOpen() {
  return !!document.querySelector('.nav-menu-wrap .nav-menu:not(.hidden)')
}

function ensureNavMenuListeners() {
  if (navMenuListenersReady) return
  navMenuListenersReady = true
  document.addEventListener('click', (event) => {
    if (navMenuIsOpen() && !event.target.closest('.nav-menu-wrap')) setNavMenuOpen(false)
  })
  window.addEventListener('resize', () => { if (navMenuIsOpen()) setNavMenuOpen(false) })
  document.addEventListener('keydown', (event) => {
    if (!navMenuIsOpen()) return
    const items = [...document.querySelectorAll('.nav-menu-wrap .nav-menu [role="menuitem"]')]
    const i = items.indexOf(document.activeElement)
    if (event.key === 'Escape') { setNavMenuOpen(false, true); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); items[(i + 1) % items.length]?.focus() }
    else if (event.key === 'ArrowUp') { event.preventDefault(); items[(i <= 0 ? items.length : i) - 1]?.focus() }
    else if (event.key === 'Home') { event.preventDefault(); items[0]?.focus() }
    else if (event.key === 'End') { event.preventDefault(); items[items.length - 1]?.focus() }
    else if (event.key === 'Tab') setNavMenuOpen(false)
  })
}

function buildAccountMenu(displayName, items) {
  ensureNavMenuListeners()
  const wrap = document.createElement('div')
  wrap.className = 'nav-menu-wrap'
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'nav-user-btn'
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')
  trigger.setAttribute('aria-label', `${displayName}, account menu`)
  trigger.innerHTML = `<span class="nav-user-name">${escapeHtml(displayName)}</span><svg class="nav-user-chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  const menu = document.createElement('div')
  menu.className = 'nav-menu hidden'
  menu.setAttribute('role', 'menu')
  items.forEach((item) => {
    if (item.divider) {
      const sep = document.createElement('div')
      sep.className = 'nav-menu-sep'
      sep.setAttribute('role', 'separator')
      menu.appendChild(sep)
      return
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.setAttribute('role', 'menuitem')
    btn.className = `nav-menu-item${item.danger ? ' danger' : ''}`
    btn.innerHTML = `${navMenuIcon(item.icon)}<span>${escapeHtml(item.label)}</span>`
    btn.addEventListener('click', () => { setNavMenuOpen(false); item.action() })
    menu.appendChild(btn)
  })
  trigger.addEventListener('click', () => {
    const open = menu.classList.contains('hidden')
    setNavMenuOpen(open)
  })
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      setNavMenuOpen(true)
      menu.querySelector('[role="menuitem"]')?.focus()
    }
  })
  wrap.append(trigger, menu)
  return wrap
}

function buildDesktopNav() {
  updateMobileNavUser()
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
  desktopNav.appendChild(desktopButton('Post a Listing', () => openCreateListingSection({ focus: false }), true))
  const menuItems = [
    { label: 'My Listings', icon: 'listings', action: () => openMyListings() },
    { label: store?.name ? 'My Store' : 'Open Store', icon: 'store', action: () => openStoreManage() },
    { label: 'Dashboard', icon: 'dashboard', action: () => openDashboard() },
    { label: 'Account', icon: 'account', action: () => openAccountSettings() },
  ]
  if (String(currentUser.email || '').toLowerCase() === OWNER_EMAIL) menuItems.push({ label: 'Reports', icon: 'reports', action: () => openAdminReports() })
  menuItems.push(
    { divider: true },
    { label: 'Install app', icon: 'install', action: () => promptInstall() },
    { label: 'Terms', icon: 'terms', action: () => openTerms() },
    { divider: true },
    { label: 'Logout', icon: 'logout', danger: true, action: async () => {
      await db.auth.signOut()
      authMsg.textContent = 'Logged out.'
      await handleAuthChange()
    } },
  )
  desktopNav.appendChild(buildAccountMenu(displayName, menuItems))
  updateCartCounts()
}

const createListingSection = document.getElementById('create-listing-section')
// Leaving the form empty (tapped away, or just scrolled past it) closes it again after a moment — long
// enough that moving focus between its own fields (title -> price -> ...) doesn't close it by mistake.
let createListingIdleTimer = 0
createListingSection?.addEventListener('focusout', () => {
  clearTimeout(createListingIdleTimer)
  createListingIdleTimer = setTimeout(() => {
    if (createListingSection.contains(document.activeElement)) return
    collapseCreateListingIfIdle()
  }, 220)
})
const containerEl = document.querySelector('.container')
const desktopSplitter = document.getElementById('desktop-splitter')
const formColumn = document.getElementById('desktop-form-column')
const titleEl = document.getElementById('title')
const titleEditor = document.getElementById('title-editor')
const priceEl = document.getElementById('price')
const priceCurrencyEl = document.getElementById('price-currency')
const paymentTypeEl = document.getElementById('payment-type')
const deliveryTypeEl = document.getElementById('delivery-type')
const urlEl = document.getElementById('url')
const urlEditor = document.getElementById('url-editor')
const categoryEl = document.getElementById('category')
const categoryEditor = document.getElementById('category-editor')
const contactMethodEl = document.getElementById('contact-method')
const contactDetailsEl = document.getElementById('contact-details')
const contactDetailsEditor = document.getElementById('contact-details-editor')
const locationEl = document.getElementById('location')
const locationEditor = document.getElementById('location-editor')
const descEl = document.getElementById('description')
const imageEl = document.getElementById('image')

function syncVisibleToHiddenField(visibleEl, hiddenEl) {
  if (!visibleEl || !hiddenEl) return
  const sync = () => {
    hiddenEl.value = visibleEl.value || ''
  }
  visibleEl.addEventListener('input', sync)
  visibleEl.addEventListener('change', sync)
  sync()
}

if (titleEditor && titleEl) syncVisibleToHiddenField(titleEditor, titleEl)
if (urlEditor && urlEl) syncVisibleToHiddenField(urlEditor, urlEl)
if (categoryEditor && categoryEl) syncVisibleToHiddenField(categoryEditor, categoryEl)
if (contactDetailsEditor && contactDetailsEl) syncVisibleToHiddenField(contactDetailsEditor, contactDetailsEl)
if (locationEditor && locationEl) syncVisibleToHiddenField(locationEditor, locationEl)

function syncFormHiddenFields() {
  if (titleEditor && titleEl) titleEl.value = titleEditor.value.trim()
  if (urlEditor && urlEl) urlEl.value = urlEditor.value.trim()
  if (categoryEditor && categoryEl) categoryEl.value = categoryEditor.value.trim()
  if (contactDetailsEditor && contactDetailsEl) contactDetailsEl.value = contactDetailsEditor.value.trim()
  if (locationEditor && locationEl) locationEl.value = locationEditor.value.trim()
}

imageEl?.addEventListener('change', () => {
  if (imageEl.files && imageEl.files.length > 3) {
    imageEl.value = ''
    showFormError('Please choose no more than 3 pictures.', imageEl)
  }
})

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
const listingSubmitState = document.getElementById('listing-submit-state')
const listingSubmitTitle = document.getElementById('listing-submit-title')
const listingSubmitDetail = document.getElementById('listing-submit-detail')
const createListingSectionEl = document.getElementById('create-listing-section')
const listCount = document.getElementById('list-count')
const listingsContainer = document.getElementById('listings')
const searchEl = document.getElementById('search-input')
const categoryChipsEl = document.getElementById('category-chips')
const categoryScrollLeftBtn = document.getElementById('category-scroll-left')
const categoryScrollRightBtn = document.getElementById('category-scroll-right')
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

// Live buyer/seller notification system. Uses the existing listing_messages
// table + Supabase Realtime, so no extra notification rows are stored.
const navNotificationsBtn = document.getElementById('nav-notifications-btn')
const navNotificationsBadge = document.getElementById('nav-notifications-badge')
const notificationsOverlay = document.getElementById('notifications-overlay')
const notificationsClose = document.getElementById('notifications-close')
const notificationsList = document.getElementById('notifications-list')
const notificationsEnable = document.getElementById('notifications-enable')
const notificationsClear = document.getElementById('notifications-clear')
const notificationsTabUpdates = document.getElementById('notifications-tab-updates')
const notificationsTabChats = document.getElementById('notifications-tab-chats')
const notificationsContext = document.getElementById('notifications-context')
const chatsList = document.getElementById('chats-list')
const NOTIFICATION_SEEN_PREFIX = 'linkhub-message-seen-v1:'
const NOTIFICATION_DISMISSED_PREFIX = 'linkhub-message-dismissed-v1:'
const NOTIFICATION_POLL_MS = 20000
let notificationChannel = null
let notificationPollTimer = null
let notificationUnreadCount = 0
let notifiedMessageIds = new Set()
let activeNotificationTab = 'updates'

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

function notificationSeenKey() {
  return `${NOTIFICATION_SEEN_PREFIX}${currentUser?.id || 'signed-out'}`
}

function notificationDismissedKey() {
  return `${NOTIFICATION_DISMISSED_PREFIX}${currentUser?.id || 'signed-out'}`
}

function getDismissedNotificationIds() {
  try {
    const raw = localStorage.getItem(notificationDismissedKey())
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.map(String).slice(-500) : [])
  } catch { return new Set() }
}

function dismissNotificationIds(ids) {
  if (!ids?.length || !currentUser) return
  const merged = getDismissedNotificationIds()
  ids.forEach((id) => { if (id) merged.add(String(id)) })
  try {
    localStorage.setItem(notificationDismissedKey(), JSON.stringify([...merged].slice(-500)))
  } catch {}
}

function clearDismissedNotifications() {
  try { localStorage.removeItem(notificationDismissedKey()) } catch {}
}

function getNotificationSeenAt() {
  try {
    const saved = localStorage.getItem(notificationSeenKey())
    if (saved) return saved
  } catch {}
  return new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
}

function setNotificationBadge(count) {
  notificationUnreadCount = Math.max(0, Number(count) || 0)
  if (!navNotificationsBadge) return
  if (notificationUnreadCount > 0) {
    navNotificationsBadge.textContent = notificationUnreadCount > 99 ? '99+' : String(notificationUnreadCount)
    navNotificationsBadge.classList.remove('hidden')
  } else {
    navNotificationsBadge.textContent = ''
    navNotificationsBadge.classList.add('hidden')
  }
}

function markNotificationsSeen() {
  if (!currentUser) return
  try { localStorage.setItem(notificationSeenKey(), new Date().toISOString()) } catch {}
  setNotificationBadge(0)
}

async function refreshNotificationCount() {
  if (!useSupabase || !currentUser) {
    setNotificationBadge(0)
    return
  }
  try {
    const { count, error } = await db.from('listing_messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', currentUser.id)
      .gt('created_at', getNotificationSeenAt())
    if (error) throw error
    setNotificationBadge(count || 0)
  } catch (e) {
    console.warn('Notification count failed:', e)
  }
}

function messageConversationKey(listingId, userA, userB) {
  if (!listingId || !userA || !userB) return ''
  const users = [String(userA), String(userB)].sort()
  return `${String(listingId)}:${users[0]}:${users[1]}`
}

function getMessageListing(row) {
  if (!row) return null
  const live = row.listing_id ? currentListings.find((item) => String(item.id) === String(row.listing_id)) : null
  if (live) return live
  const title = String(row.listing_title_snapshot || '').trim()
  const image = String(row.listing_image_snapshot || '').trim()
  if (!title && !image) return null
  return {
    id: row.listing_id || null,
    title: title || 'Listing no longer available',
    image_url: image || null,
    image_urls: image ? [image] : [],
    user_id: row.listing_owner_id_snapshot || null,
  }
}

function getNotificationListing(listingId, row = null) {
  if (listingId) {
    const live = currentListings.find((item) => String(item.id) === String(listingId))
    if (live) return live
  }
  return getMessageListing(row)
}

function notificationListingTitle(listingId, row = null) {
  const listing = getNotificationListing(listingId, row)
  return listing?.title || 'Listing no longer available'
}

function notificationListingImage(listingId, row = null) {
  const listing = getNotificationListing(listingId, row)
  const image = listing ? getListingImages(listing)[0] : ''
  return image && isValidImageUrl(image) ? image : ''
}

function deletedCounterpartyRole(row) {
  if (!row || !currentUser) return ''
  const senderDeleted = !row.sender_id && String(row.receiver_id || '') === String(currentUser.id)
  const receiverDeleted = !row.receiver_id && String(row.sender_id || '') === String(currentUser.id)
  if (!senderDeleted && !receiverDeleted) return ''
  if (senderDeleted) return String(row.sender_role || 'buyer').toLowerCase()
  const senderRole = String(row.sender_role || 'buyer').toLowerCase()
  return senderRole === 'seller' ? 'buyer' : 'seller'
}

function counterpartyDeletedText(row) {
  const role = deletedCounterpartyRole(row)
  if (!role) return ''
  return `The ${role} deleted their LinkHub account. You can still read this conversation, but you can’t send new messages to this account.`
}

function counterpartyDeletedShort(row) {
  const role = deletedCounterpartyRole(row)
  return role ? `The ${role} deleted their account` : ''
}

function notificationSenderLabel(row) {
  const deleted = counterpartyDeletedShort(row)
  if (deleted) return deleted
  const listing = getNotificationListing(row?.listing_id, row)
  const store = row?.sender_id ? getStoreForUser(row.sender_id) : null
  if (store?.name) return store.name
  if (listing && String(listing.user_id) === String(row?.sender_id)) return 'Seller'
  return 'Buyer'
}

function notificationTypeLabel(row) {
  return deletedCounterpartyRole(row) ? 'Conversation closed' : (row?.offer_amount != null ? 'New offer' : 'New message')
}

function formatNotificationTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function maybeBrowserNotify(title, body, data = {}) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const note = new Notification(title, { body, tag: `linkhub-message-${data.messageId || Date.now()}` })
    setTimeout(() => note.close?.(), 6000)
  } catch (e) {
    console.warn('Browser notification failed:', e)
  }
}

async function enableBrowserNotifications() {
  if (!('Notification' in window)) {
    showUxToast('Your browser does not support notifications.', 'error')
    return
  }
  try {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      notificationsEnable?.classList.add('hidden')
      showUxToast('Browser notifications are on.')
    } else if (permission === 'denied') {
      showUxToast('Notifications are blocked in your browser settings.', 'error')
    }
  } catch {
    showUxToast('Could not turn on browser notifications.', 'error')
  }
}

async function loadNotificationList() {
  if (!notificationsList) return
  if (!useSupabase || !currentUser) {
    notificationsList.innerHTML = '<div class="notification-empty">Sign in to see your messages.</div>'
    return
  }
  notificationsList.innerHTML = '<div class="notification-empty">Loading…</div>'
  try {
    const dismissed = getDismissedNotificationIds()
    const { data, error } = await db.from('listing_messages')
      .select('id,listing_id,listing_title_snapshot,listing_image_snapshot,listing_owner_id_snapshot,conversation_key,sender_id,receiver_id,sender_role,kind,body,offer_amount,created_at')
      .eq('receiver_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    const closedSeen = new Set()
    const visible = (data || []).filter((row) => !dismissed.has(String(row.id))).filter((row) => {
      if (!deletedCounterpartyRole(row)) return true
      const key = row.conversation_key || String(row.listing_id || row.id)
      if (closedSeen.has(key)) return false
      closedSeen.add(key)
      return true
    })
    if (!visible.length) {
      notificationsList.innerHTML = '<div class="notification-empty"><strong>No updates</strong><span>Your notifications are clear. Your conversations are still saved under <b>Chats</b>.</span></div>'
      return
    }
    const seenAt = getNotificationSeenAt()
    notificationsList.innerHTML = visible.map((row) => {
      const unread = new Date(row.created_at) > new Date(seenAt)
      const listingTitle = notificationListingTitle(row.listing_id, row)
      const listingImage = notificationListingImage(row.listing_id, row)
      const sender = notificationSenderLabel(row)
      const typeLabel = notificationTypeLabel(row)
      const offer = row.offer_amount != null ? `R${Number(row.offer_amount).toFixed(2)}` : ''
      const previewText = counterpartyDeletedText(row) || String(row.body || '').trim() || (offer ? `Offer: ${offer}` : 'You received a new message.')
      const thumb = listingImage
        ? `<img class="notification-thumb" src="${escapeHtml(listingImage)}" alt="" loading="lazy">`
        : `<span class="notification-thumb notification-thumb-empty" aria-hidden="true">${ICON_LISTINGS}</span>`
      const offerLine = offer ? `<span class="notification-offer">Offer ${escapeHtml(offer)}</span>` : ''
      return `<button type="button" class="notification-item update-item${unread ? ' notification-unread' : ''}${deletedCounterpartyRole(row) ? ' conversation-closed-item' : ''}" data-notification-id="${escapeHtml(row.id)}" data-listing-id="${escapeHtml(row.listing_id || "")}" data-sender-id="${escapeHtml(row.sender_id || "")}" data-conversation-key="${escapeHtml(row.conversation_key || "")}">
        <span class="notification-dot-wrap"><span class="notification-dot${unread ? '' : ' notification-dot-hidden'}" aria-hidden="true"></span></span>
        ${thumb}
        <span class="notification-copy">
          <strong>${escapeHtml(typeLabel)}</strong>
          <span class="notification-listing-title">${escapeHtml(listingTitle)}</span>
          <span class="notification-from">From ${escapeHtml(sender)}${offerLine ? ` · ${offerLine}` : ''}</span>
          <span class="notification-preview">${escapeHtml(previewText)}</span>
          <small class="notification-time">${escapeHtml(formatNotificationTime(row.created_at))}</small>
        </span>
      </button>`
    }).join('')
  } catch (e) {
    console.warn('Loading notifications failed:', e)
    notificationsList.innerHTML = '<div class="notification-empty">Notifications could not be loaded right now.</div>'
  }
}

async function loadChatList() {
  if (!chatsList) return
  if (!useSupabase || !currentUser) {
    chatsList.innerHTML = '<div class="notification-empty">Sign in to see your chats.</div>'
    return
  }
  chatsList.innerHTML = '<div class="notification-empty">Loading…</div>'
  try {
    const { data, error } = await db.from('listing_messages')
      .select('id,listing_id,listing_title_snapshot,listing_image_snapshot,listing_owner_id_snapshot,conversation_key,sender_id,receiver_id,sender_role,kind,body,offer_amount,created_at')
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false })
      .limit(250)
    if (error) throw error
    const threads = new Map()
    for (const row of data || []) {
      const otherUserId = String(row.sender_id) === String(currentUser.id) ? row.receiver_id : row.sender_id
      const key = row.conversation_key || `${row.listing_id}:${otherUserId}`
      if (!threads.has(key)) threads.set(key, row)
    }
    if (!threads.size) {
      chatsList.innerHTML = '<div class="notification-empty"><strong>No conversations yet</strong><span>When you message a buyer or seller, the conversation will stay here.</span></div>'
      return
    }
    chatsList.innerHTML = [...threads.values()].map((row) => {
      const listingTitle = notificationListingTitle(row.listing_id, row)
      const listingImage = notificationListingImage(row.listing_id, row)
      const otherUserId = String(row.sender_id) === String(currentUser.id) ? row.receiver_id : row.sender_id
      const sender = deletedCounterpartyRole(row)
        ? counterpartyDeletedShort(row)
        : (String(row.sender_id) === String(currentUser.id) ? 'You' : notificationSenderLabel(row))
      const preview = counterpartyDeletedText(row) || String(row.body || '').trim() || (row.offer_amount != null ? `Offer: R${Number(row.offer_amount).toFixed(2)}` : 'Message')
      const offer = row.offer_amount != null ? `<span class="chat-list-offer">Offer R${Number(row.offer_amount).toFixed(2)}</span>` : ''
      const thumb = listingImage
        ? `<img class="notification-thumb" src="${escapeHtml(listingImage)}" alt="" loading="lazy">`
        : `<span class="notification-thumb notification-thumb-empty" aria-hidden="true">${ICON_LISTINGS}</span>`
      return `<button type="button" class="notification-item chat-list-item${deletedCounterpartyRole(row) ? ' conversation-closed-item' : ''}" data-listing-id="${escapeHtml(row.listing_id || '')}" data-sender-id="${escapeHtml(otherUserId || '')}" data-conversation-key="${escapeHtml(row.conversation_key || '')}">
        ${thumb}
        <span class="notification-copy">
          <strong>${escapeHtml(listingTitle)}</strong>
          <span class="notification-from">${escapeHtml(sender)}${offer ? ` · ${offer}` : ''}</span>
          <span class="notification-preview">${escapeHtml(preview)}</span>
          <small class="notification-time">${escapeHtml(formatNotificationTime(row.created_at))}</small>
        </span>
      </button>`
    }).join('')
  } catch (e) {
    console.warn('Loading chats failed:', e)
    chatsList.innerHTML = '<div class="notification-empty">Chats could not be loaded right now.</div>'
  }
}

function setNotificationTab(tab) {
  activeNotificationTab = tab === 'chats' ? 'chats' : 'updates'
  const updates = activeNotificationTab === 'updates'
  notificationsList?.classList.toggle('hidden', !updates)
  chatsList?.classList.toggle('hidden', updates)
  notificationsClear?.classList.toggle('hidden', !updates)
  notificationsTabUpdates?.classList.toggle('is-active', updates)
  notificationsTabChats?.classList.toggle('is-active', !updates)
  notificationsTabUpdates?.setAttribute('aria-selected', String(updates))
  notificationsTabChats?.setAttribute('aria-selected', String(!updates))
  if (notificationsContext) notificationsContext.textContent = updates ? 'New messages and offers' : 'Your recent conversations'
  if (!updates) loadChatList()
}

async function openNotifications() {
  if (!notificationsOverlay) return
  if (notificationsEnable && 'Notification' in window && Notification.permission === 'granted') notificationsEnable.classList.add('hidden')
  else notificationsEnable?.classList.remove('hidden')
  notificationsOverlay.classList.remove('hidden')
  notificationsOverlay.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
  setNotificationTab('updates')
  await loadNotificationList()
  markNotificationsSeen()
}

function closeNotifications() {
  if (!notificationsOverlay) return
  notificationsOverlay.classList.add('hidden')
  notificationsOverlay.setAttribute('aria-hidden', 'true')
  document.documentElement.classList.remove('lightbox-open')
}

function showIncomingMessageNotification(row) {
  if (!row || !currentUser || String(row.receiver_id) !== String(currentUser.id)) return
  const id = String(row.id || '')
  if (!id || notifiedMessageIds.has(id)) return
  notifiedMessageIds.add(id)
  if (notifiedMessageIds.size > 200) notifiedMessageIds = new Set([...notifiedMessageIds].slice(-100))

  const isOpenThread = activeMessageContext && String(activeMessageContext.conversationKey || '') === String(row.conversation_key || '')
  refreshNotificationCount().catch(() => {})
  if (isOpenThread && !document.hidden) return

  const text = String(row.body || '').trim()
  const preview = text.length > 90 ? `${text.slice(0, 87)}…` : text
  const listingTitle = notificationListingTitle(row.listing_id, row)
  const typeLabel = notificationTypeLabel(row)
  showUxToast(`${typeLabel} · ${listingTitle}`)
  maybeBrowserNotify(`LinkHub · ${typeLabel}`, `${listingTitle}${preview ? ` — ${preview}` : ''}`, { messageId: row.id })
}

function stopGlobalMessageNotifications() {
  if (notificationPollTimer) { clearInterval(notificationPollTimer); notificationPollTimer = null }
  if (notificationChannel) {
    try { db.removeChannel(notificationChannel) } catch {}
    notificationChannel = null
  }
  notifiedMessageIds = new Set()
  setNotificationBadge(0)
}

function startGlobalMessageNotifications() {
  stopGlobalMessageNotifications()
  if (!useSupabase || !currentUser) return
  refreshNotificationCount().catch(() => {})
  if (typeof db.channel === 'function') {
    try {
      notificationChannel = db.channel(`linkhub-notifications-${currentUser.id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'listing_messages',
          filter: `receiver_id=eq.${currentUser.id}`
        }, (payload) => showIncomingMessageNotification(payload?.new))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') refreshNotificationCount().catch(() => {})
        })
    } catch (e) {
      console.warn('Global message realtime unavailable:', e)
    }
  }
  notificationPollTimer = setInterval(() => {
    if (!currentUser || document.hidden) return
    refreshNotificationCount().catch(() => {})
  }, NOTIFICATION_POLL_MS)
}

navNotificationsBtn?.addEventListener('click', openNotifications)
notificationsClose?.addEventListener('click', closeNotifications)
notificationsOverlay?.addEventListener('click', (event) => {
  if (event.target === notificationsOverlay) closeNotifications()
})
notificationsEnable?.addEventListener('click', enableBrowserNotifications)
notificationsTabUpdates?.addEventListener('click', () => setNotificationTab('updates'))
notificationsTabChats?.addEventListener('click', () => setNotificationTab('chats'))
notificationsClear?.addEventListener('click', () => {
  const ids = [...(notificationsList?.querySelectorAll('[data-notification-id]') || [])].map((el) => el.dataset.notificationId).filter(Boolean)
  dismissNotificationIds(ids)
  markNotificationsSeen()
  loadNotificationList()
  showUxToast(ids.length ? 'Updates cleared. Your chats are still saved.' : 'No updates to clear.')
})
const handleConversationOpen = async (event) => {
  const item = event.target.closest('.notification-item')
  if (!item || !currentUser) return
  const listingId = item.dataset.listingId || ''
  const senderId = item.dataset.senderId || ''
  const conversationKey = item.dataset.conversationKey || ''
  let seedRow = null
  try {
    if (useSupabase) {
      let q = db.from('listing_messages')
        .select('id,listing_id,listing_title_snapshot,listing_image_snapshot,listing_owner_id_snapshot,conversation_key,sender_id,receiver_id,sender_role,kind,body,offer_amount,created_at')
        .order('created_at', { ascending: false })
        .limit(1)
      if (conversationKey) q = q.eq('conversation_key', conversationKey)
      else if (listingId) q = q.eq('listing_id', listingId).or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      const { data } = await q
      seedRow = data?.[0] || null
    }
  } catch {}
  const listing = getMessageListing(seedRow || { listing_id: listingId })
  if (!listing) { closeNotifications(); showUxToast('That conversation is no longer available.'); return }
  const me = String(currentUser.id)
  const otherId = seedRow ? (String(seedRow.sender_id || '') === me ? seedRow.receiver_id : seedRow.sender_id) : senderId
  const ownerId = listing.user_id || seedRow?.listing_owner_id_snapshot
  const mode = String(ownerId || '') === me ? 'seller' : 'buyer'
  const otherName = seedRow ? notificationSenderLabel(seedRow) : ''
  openMessageThread(listing, otherId || null, mode, otherName, seedRow || null)
}
notificationsList?.addEventListener('click', handleConversationOpen)
chatsList?.addEventListener('click', handleConversationOpen)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshNotificationCount().catch(() => {})
})

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
  setListingSubmitState(false)
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
  if (createListingSection) { createListingSection.classList.add('create-listing-editing'); setCreateListingCollapsed(false) }
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

function clampPanelWidth(value) {
  const min = window.innerWidth > 1200 ? 400 : 360
  const max = Math.min(window.innerWidth - 360, 620)
  return Math.min(Math.max(value, min), max)
}

function updateDesktopPanelWidth(width) {
  if (!containerEl) return
  const next = clampPanelWidth(width)
  containerEl.style.setProperty('--left-panel-width', `${next}px`)
}

if (desktopSplitter && containerEl) {
  let dragging = false
  const beginResize = (event) => {
    if (window.innerWidth <= 900) return
    dragging = true
    desktopSplitter.setPointerCapture?.(event.pointerId)
    desktopSplitter.classList.add('is-dragging')
    event.preventDefault()
  }

  const finishResize = () => {
    dragging = false
    desktopSplitter.classList.remove('is-dragging')
  }

  desktopSplitter.addEventListener('pointerdown', beginResize)
  desktopSplitter.addEventListener('pointerup', finishResize)
  desktopSplitter.addEventListener('pointerleave', finishResize)
  desktopSplitter.addEventListener('keydown', (event) => {
    if (!containerEl) return
    const current = parseFloat(getComputedStyle(containerEl).getPropertyValue('--left-panel-width')) || 440
    const step = event.shiftKey ? 40 : 20
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      updateDesktopPanelWidth(current + step)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      updateDesktopPanelWidth(current - step)
    }
  })

  document.addEventListener('pointermove', (event) => {
    if (!dragging || !containerEl) return
    const bounds = containerEl.getBoundingClientRect()
    const next = event.clientX - bounds.left
    updateDesktopPanelWidth(next)
  })
  document.addEventListener('pointerup', finishResize)
  document.addEventListener('pointercancel', finishResize)
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
      // Collect every listing image + store banner/logo while the user is
      // still authenticated, then remove them through the Storage API before
      // the account is finally deleted. If any Storage deletion fails, stop
      // here so we do not leave an account behind with files we can no
      // longer reach. Listing photos and store branding live in separate
      // buckets, so they're removed with two separate calls.
      const uid = currentUser.id
      const [{ data: userListings, error: listingsErr }, { data: userStore, error: storeErr }] = await Promise.all([
        db.from('listings').select('*').eq('user_id', uid),
        db.from('stores').select('*').eq('id', uid).maybeSingle()
      ])
      if (listingsErr) throw listingsErr
      if (storeErr && storeErr.code !== 'PGRST116') throw storeErr

      const listingPaths = []
      for (const listing of userListings || []) listingPaths.push(...extractStoragePaths(listing))
      const uniqueListingPaths = [...new Set(listingPaths)]

      const storePaths = []
      if (userStore?.banner_url) storePaths.push(...extractStoreStoragePaths({ image_url: userStore.banner_url }))
      if (userStore?.logo_url) storePaths.push(...extractStoreStoragePaths({ image_url: userStore.logo_url }))
      const uniqueStorePaths = [...new Set(storePaths)]

      const totalCount = uniqueListingPaths.length + uniqueStorePaths.length
      if (totalCount && db.storage) {
        accountMsg.textContent = `Removing ${totalCount} stored image${totalCount === 1 ? '' : 's'}…`
        if (uniqueListingPaths.length) {
          const { error: storageErr } = await db.storage.from(LISTING_IMAGES_BUCKET).remove(uniqueListingPaths)
          if (storageErr) throw storageErr
        }
        if (uniqueStorePaths.length) {
          const { error: storeStorageErr } = await db.storage.from(STORE_ASSETS_BUCKET).remove(uniqueStorePaths)
          if (storeStorageErr) throw storeStorageErr
        }
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
  stopGlobalMessageNotifications()
  const { data } = await db.auth.getUser()
  const user = data.user
  currentUser = user
  loadCartyConversationForCurrentUser()
  loadFavoritesForCurrentUser()
  if (user) {
    authSection.style.display = 'none'
    createListingSection.style.display = ''
    collapseCreateListingIfIdle()
    // Keep the form compact by default and allow expanding via More options
    setFormCompact(true)
    setTimeout(() => window.linkhubApplyStoreDefaults?.(), 0)
  } else {
    authSection.style.display = ''
    createListingSection.style.display = 'none'
  }
  buildDrawerMenu()
  buildDesktopNav()
  if (user) startGlobalMessageNotifications()
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

function setListingSubmitState(active, title = 'Creating your listing', detail = 'Preparing everything...') {
  if (!listingSubmitState) return
  listingSubmitState.classList.toggle('active', !!active)
  listingSubmitState.setAttribute('aria-hidden', active ? 'false' : 'true')
  createListingSectionEl?.classList.toggle('is-submitting', !!active)
  if (listingSubmitTitle) listingSubmitTitle.textContent = title
  if (listingSubmitDetail) listingSubmitDetail.textContent = detail
  if (active) openLinkHubProgress(title, detail, 12, 'Checking details')
  if (createListingBtn) {
    createListingBtn.disabled = !!active
    createListingBtn.setAttribute('aria-busy', active ? 'true' : 'false')
  }
}

function updateListingSubmitState(title, detail, progress = null) {
  if (!listingSubmitState) return
  if (listingSubmitTitle) listingSubmitTitle.textContent = title
  if (listingSubmitDetail) listingSubmitDetail.textContent = detail
  if (typeof progress === 'number') {
    const pct = Math.max(24, Math.min(100, progress))
    const fill = document.getElementById('listing-progress-fill')
    if (fill) fill.style.width = `${pct}%`
  }
  updateLinkHubProgress(title, detail, progress, detail.replace(/[.…]+$/, ''))
}

const linkhubActionModal = document.getElementById('linkhub-action-modal')
const linkhubActionIcon = document.getElementById('linkhub-action-icon')
const linkhubActionTitle = document.getElementById('linkhub-action-title')
const linkhubActionDetail = document.getElementById('linkhub-action-detail')
const linkhubActionProgressWrap = document.getElementById('linkhub-action-progress-wrap')
const linkhubActionProgressFill = document.getElementById('linkhub-action-progress-fill')
const linkhubActionProgressLabel = document.getElementById('linkhub-action-progress-label')
const linkhubActionMissing = document.getElementById('linkhub-action-missing')
const linkhubActionClose = document.getElementById('linkhub-action-close')
const linkhubActionFix = document.getElementById('linkhub-action-fix')
let linkhubActionTimer = null
let linkhubActionFocusField = null

function closeLinkHubActionModal() {
  clearTimeout(linkhubActionTimer)
  linkhubActionTimer = null
  linkhubActionModal?.classList.add('hidden')
  linkhubActionModal?.setAttribute('aria-hidden', 'true')
  document.documentElement.classList.remove('linkhub-action-open')
}

function setLinkHubActionIcon(state = 'loading') {
  if (!linkhubActionIcon) return
  linkhubActionIcon.className = `linkhub-action-icon is-${state}`
}

function openLinkHubProgress(title, detail, progress = 10, label = 'Getting ready') {
  if (!linkhubActionModal) return
  clearTimeout(linkhubActionTimer)
  linkhubActionModal.className = 'linkhub-action-modal'
  linkhubActionModal.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('linkhub-action-open')
  setLinkHubActionIcon('loading')
  if (linkhubActionTitle) linkhubActionTitle.textContent = title
  if (linkhubActionDetail) linkhubActionDetail.textContent = detail
  if (linkhubActionProgressFill) linkhubActionProgressFill.style.width = `${Math.max(8, Math.min(100, progress))}%`
  if (linkhubActionProgressLabel) linkhubActionProgressLabel.textContent = label
  linkhubActionProgressWrap?.classList.remove('hidden')
  linkhubActionMissing?.classList.add('hidden')
  linkhubActionClose?.classList.add('hidden')
  linkhubActionFix?.classList.add('hidden')
}

function updateLinkHubProgress(title, detail, progress = null, label = '') {
  if (!linkhubActionModal || linkhubActionModal.classList.contains('hidden')) return
  if (linkhubActionTitle) linkhubActionTitle.textContent = title
  if (linkhubActionDetail) linkhubActionDetail.textContent = detail
  if (typeof progress === 'number' && linkhubActionProgressFill) linkhubActionProgressFill.style.width = `${Math.max(8, Math.min(100, progress))}%`
  if (linkhubActionProgressLabel && label) linkhubActionProgressLabel.textContent = label
}

function showLinkHubMissing(fields, focusField = null) {
  if (!linkhubActionModal) return
  clearTimeout(linkhubActionTimer)
  linkhubActionFocusField = focusField
  linkhubActionModal.className = 'linkhub-action-modal is-warning'
  linkhubActionModal.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('linkhub-action-open')
  setLinkHubActionIcon('warning')
  if (linkhubActionTitle) linkhubActionTitle.textContent = 'A few details are still missing'
  if (linkhubActionDetail) linkhubActionDetail.textContent = 'LinkHub needs these before your listing can be posted.'
  if (linkhubActionMissing) {
    const count = fields.length
    const items = fields.map((field, index) => `
      <li class="linkhub-missing-item${index === 0 ? ' is-first' : ''}">
        <span class="linkhub-missing-number" aria-hidden="true">${index + 1}</span>
        <div class="linkhub-missing-item-copy">
          <strong>${index === 0 ? 'Start here' : 'Still needed'}</strong>
          <span>${escapeHtml(field)}</span>
        </div>
      </li>
    `).join('')
    linkhubActionMissing.innerHTML = `
      <div class="linkhub-missing-summary">
        <span class="linkhub-missing-count">${count}</span>
        <div>
          <strong>${count === 1 ? 'One detail is missing' : `${count} details are missing`}</strong>
          <span>Finish these before your listing can be posted.</span>
        </div>
      </div>
      <ul class="linkhub-missing-list">${items}</ul>
    `
    linkhubActionMissing.classList.remove('hidden')
  }
  linkhubActionProgressWrap?.classList.add('hidden')
  linkhubActionClose?.classList.remove('hidden')
  linkhubActionFix?.classList.remove('hidden')
}

function showLinkHubResult(success, title, detail) {
  if (!linkhubActionModal) return
  linkhubActionModal.className = 'linkhub-action-modal is-complete'
  linkhubActionModal.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('linkhub-action-open')
  setLinkHubActionIcon(success ? 'success' : 'error')
  if (linkhubActionTitle) linkhubActionTitle.textContent = title
  if (linkhubActionDetail) linkhubActionDetail.textContent = detail
  linkhubActionProgressWrap?.classList.add('hidden')
  linkhubActionMissing?.classList.add('hidden')
  linkhubActionClose?.classList.remove('hidden')
  linkhubActionFix?.classList.add('hidden')
  if (success) linkhubActionTimer = setTimeout(closeLinkHubActionModal, 1100)
}

linkhubActionClose?.addEventListener('click', () => {
  closeLinkHubActionModal()
  if (linkhubActionFocusField) {
    const field = linkhubActionFocusField
    linkhubActionFocusField = null
    setTimeout(() => {
      field.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      field.focus?.()
    }, 60)
  }
})
linkhubActionFix?.addEventListener('click', () => linkhubActionClose?.click())
// Tap outside the card to dismiss it (not while it's busy saving).
linkhubActionModal?.addEventListener('click', (event) => {
  if (event.target.closest('.linkhub-action-card')) return
  if (linkhubActionModal.classList.contains('is-warning')) linkhubActionClose?.click()
  else if (linkhubActionModal.classList.contains('is-complete')) closeLinkHubActionModal()
})

createListingBtn.addEventListener('click', async () => {
  listingMsg.textContent = ''
  const agreeTermsEl = document.getElementById('agree-terms')
  syncFormHiddenFields()
  const missing = []
  let firstMissing = null
  const requireField = (value, label, field) => {
    if (!String(value || '').trim()) {
      missing.push(label)
      if (!firstMissing) firstMissing = field || null
    }
  }
  requireField(titleEl?.value, 'Add a title for the listing.', titleEl)
  requireField(priceEl?.value, 'Add a price.', priceEl)
  requireField(urlEl?.value, 'Tell buyers the item condition.', urlEl || urlEditor)
  requireField(categoryEl?.value, 'Choose a category.', categoryEl)
  requireField(deliveryTypeEl?.value, 'Choose delivery or pickup.', deliveryTypeEl)
  requireField(locationEl?.value, 'Add your location or city.', locationEl || locationEditor)
  requireField(descEl?.value, 'Add a short description.', descEl)
  requireField(contactMethodEl?.value, 'Choose a contact method.', contactMethodEl)
  requireField(contactDetailsEl?.value, 'Enter contact details.', contactDetailsEl || contactDetailsEditor)
  requireField(paymentTypeEl?.value, 'Choose a payment method.', paymentTypeEl)

  const existingForValidation = editingId ? (currentListings.find((item) => item.id === editingId) || localState.listings.find((item) => item.id === editingId)) : null
  const hasExistingImages = !!(existingForValidation && getListingImages(existingForValidation).length)
  const selectedFilesForValidation = imageEl?.files ? [...imageEl.files] : []
  if (selectedFilesForValidation.length > 3) {
    missing.push('Choose no more than 3 photos.')
    if (!firstMissing) firstMissing = imageEl
  }
  if (!selectedFilesForValidation.length && !hasExistingImages) {
    missing.push('Add at least 1 photo.')
    if (!firstMissing) firstMissing = imageEl
  }
  if (agreeTermsEl && !agreeTermsEl.checked) {
    missing.push('Agree to the Terms & Conditions.')
    if (!firstMissing) firstMissing = agreeTermsEl
  }
  if (missing.length) {
    showLinkHubMissing(missing, firstMissing)
    return
  }

  try {
    setListingSubmitState(true, editingId ? 'Saving your changes' : 'Creating your listing', editingId ? 'Checking the listing details...' : 'Checking the listing details...')
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
    if (!selectedFiles.length && !image_urls.length) {
      return showFormError('Please upload at least one picture before posting.', imageEl)
    }

    // When editing, choosing new pictures replaces the old gallery.
    // This keeps every listing capped at a maximum of 3 pictures.
    if (selectedFiles.length) image_urls = []

    if (selectedFiles.length) {
      updateListingSubmitState(editingId ? 'Saving your changes' : 'Creating your listing', `Optimizing ${selectedFiles.length} photo${selectedFiles.length === 1 ? '' : 's'}…`, 42)
      for (let i = 0; i < selectedFiles.length; i++) {
        updateListingSubmitState(editingId ? 'Saving your changes' : 'Creating your listing', `Preparing photo ${i + 1} of ${selectedFiles.length}…`, 42 + Math.round(((i + 0.35) / selectedFiles.length) * 30))
        const compressed = await compressImage(selectedFiles[i])
        const path = `${currentUser?.id || 'anon'}/${Date.now()}_${i}_${compressed.name}`
        let uploadedUrl = null
        try {
          if (useSupabase && db.storage) {
            updateListingSubmitState(editingId ? 'Saving your changes' : 'Creating your listing', `Uploading photo ${i + 1} of ${selectedFiles.length}…`, 48 + Math.round(((i + 0.65) / selectedFiles.length) * 30))
            const storage = db.storage.from(LISTING_IMAGES_BUCKET)
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
      updateListingSubmitState(editingId ? 'Saving your changes' : 'Creating your listing', 'Photos are ready. Finishing the details…', 82)
    }

    if (!image_urls.length && existingListing) image_urls = getListingImages(existingListing)
    image_url = image_urls[0] || null

    syncFormHiddenFields()

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
      try { await db.storage.from(LISTING_IMAGES_BUCKET).remove([...new Set(uploadedStoragePaths)]) }
      catch (cleanupErr) { console.warn('Could not clean up newly uploaded listing images', cleanupErr) }
    }

    updateListingSubmitState(editingId ? 'Saving your changes' : 'Publishing your listing', 'Checking the final details…', 88)

    if (!obj.title) { await cleanupUploadedStorage(); return showFormError('Please enter a title for your listing.', titleEl) }
    if (!obj.price) { await cleanupUploadedStorage(); return showFormError('Please enter a price for your listing.', priceEl) }
    if (!obj.url) { await cleanupUploadedStorage(); return showFormError('Please tell buyers the item condition.', urlEl || urlEditor) }
    if (!obj.category) { await cleanupUploadedStorage(); return showFormError('Please choose a category for your listing.', categoryEl) }
    if (!obj.delivery_type) { await cleanupUploadedStorage(); return showFormError('Please choose a delivery or pickup option.', deliveryTypeEl) }
    if (!obj.location) { await cleanupUploadedStorage(); return showFormError('Please add your location or city.', locationEl || locationEditor) }
    if (!obj.description) { await cleanupUploadedStorage(); return showFormError('Please add a short description for the product.', descEl) }
    if (!obj.contact_method) { await cleanupUploadedStorage(); return showFormError('Please choose a contact method for buyers.', contactMethodEl) }
    if (!obj.contact_details) { await cleanupUploadedStorage(); return showFormError('Please enter your contact details so buyers can reach you.', contactDetailsEl || contactDetailsEditor) }
    if (!obj.payment_type) { await cleanupUploadedStorage(); return showFormError('Please choose a payment method.', paymentTypeEl) }

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
    updateListingSubmitState(editingId ? 'Saving your changes' : 'Publishing your listing', editingId ? 'Saving your changes to LinkHub…' : 'Publishing it on LinkHub…', 94)
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
              const { error: cleanupErr } = await db.storage.from(LISTING_IMAGES_BUCKET).remove(oldPaths)
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

      setListingSubmitState(false)
      showLinkHubResult(true, 'Listing updated', 'Your changes are now live on LinkHub.')
      listingMsg.textContent = 'Listing updated successfully.'
      exitEditMode()
      collapseCreateListingIfIdle()
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

      setListingSubmitState(false)
      showLinkHubResult(true, 'Listing created', 'Your listing is now live on LinkHub.')
      listingMsg.textContent = 'Listing created successfully.'
      collapseCreateListingIfIdle()
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
    setListingSubmitState(false)
    if (typeof uploadedStoragePaths !== 'undefined' && uploadedStoragePaths.length && useSupabase && db.storage) {
      try { await db.storage.from(LISTING_IMAGES_BUCKET).remove([...new Set(uploadedStoragePaths)]) }
      catch (cleanupErr) { console.warn('Could not clean up listing images after save failure', cleanupErr) }
    }
    listingMsg.textContent = err.message
    showLinkHubResult(false, 'LinkHub could not publish it', err?.message || 'Something went wrong while creating the listing.')
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
  if (btn.classList.contains('message-buyer-btn')) {
    if (!currentUser) return alert('Please sign in to message.')
    const listing = currentListings.find((r) => String(r.id) === String(id))
    const buyerId = btn.dataset.buyerId || ''
    if (listing && buyerId) openMessageThread(listing, buyerId, 'seller', btn.dataset.buyerName || '')
    return
  }
  if (btn.classList.contains('offer-btn')) {
    if (!currentUser) return alert('Please sign in to make an offer.')
    const item = currentListings.find((r) => r.id === id)
    if (!item) return
    if (String(item.user_id) === String(currentUser.id)) return alert('You cannot make an offer on your own listing.')
    openMessageThread(item, item.user_id, 'buyer')
    return
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

function armLoadingScreenHide() {
  if (window.__linkhubLoadingHidden) return
  window.__linkhubLoadingHidden = true
  hideLoadingScreen()
}

document.addEventListener('DOMContentLoaded', () => {
  // Ensure the listing form starts compact and toggle text is correct.
  try {
    setFormCompact(true)
  } catch (e) {}
})

// The splash always stays for at least this long, even when the app loads instantly (cached visits).
// On a slow connection it simply leaves as soon as the page has loaded.
const SPLASH_MIN_MS = 2000

function scheduleLoadingScreenHide() {
  const shownAt = window.__linkhubSplashShownAt ?? 0 // stamped by a tiny script right after the splash markup
  const wait = Math.max(0, SPLASH_MIN_MS - (performance.now() - shownAt))
  setTimeout(armLoadingScreenHide, wait)
}

if (document.readyState === 'complete') scheduleLoadingScreenHide()
else window.addEventListener('load', scheduleLoadingScreenHide, { once: true })

// Safety fallback: if the app boot process is interrupted, the loader still clears.
setTimeout(armLoadingScreenHide, 5000)

// My Listings: dedicated overlay showing only the signed-in user's own posts
const myListingsOverlay = document.getElementById('my-listings-overlay')
const myListingsClose = document.getElementById('my-listings-close')
const myListingsGrid = document.getElementById('my-listings-grid')
const myListingsCount = document.getElementById('my-listings-count')
const myListingsOffersBtn = document.getElementById('my-listings-offers')
const myListingsOffersPanel = document.getElementById('my-listings-offers-panel')

function renderMyListings() {
  if (!myListingsGrid) return
  myListingsGrid.innerHTML = ''
  myListingsOffersPanel?.classList.add('hidden')
  if (myListingsOffersBtn) { myListingsOffersBtn.classList.add('hidden'); myListingsOffersBtn.textContent = 'Offers' }
  if (!currentUser) return
  const mine = currentListings.filter((item) => item.user_id === currentUser.id)
  if (myListingsCount) myListingsCount.textContent = `${mine.length} listing${mine.length === 1 ? '' : 's'}`
  if (!mine.length) {
    myListingsGrid.innerHTML = '<div class="muted">You haven\'t posted anything yet. Create a listing above to see it here.</div>'
    return
  }
  mine.forEach((item) => renderListing(item, myListingsGrid))
  const listingIds = mine.map((item) => item.id)
  // Seller offers are shown in the compact Offers panel above the listings.
  loadSellerOfferSummary(listingIds)
}

// ---------------------------------------------------------------------------
// Chat-style messaging between buyer and seller (opened from "Make an Offer"
// and the seller's "Message" button). Behaves like a normal messaging app:
// bubbles grouped by sender, day separators, live updates, quick replies and
// an optional offer amount that shows up as an offer card inside the bubble.
// ---------------------------------------------------------------------------
const messageOverlay = document.getElementById('message-overlay')
const messageClose = document.getElementById('message-close')
const messageTitle = document.getElementById('message-title')
const messageListingTitle = document.getElementById('message-listing-title')
const messageThread = document.getElementById('message-thread')
const messageOfferAmount = document.getElementById('message-offer-amount')
const messageInput = document.getElementById('message-input')
const messageSend = document.getElementById('message-send')
const messageStatus = document.getElementById('message-status')
const chatAvatarEl = document.getElementById('chat-avatar')
const chatListingCard = document.getElementById('chat-listing-card')
const chatQuickReplies = document.getElementById('chat-quick-replies')
const chatOfferBar = document.getElementById('chat-offer-bar')
const chatOfferToggle = document.getElementById('chat-offer-toggle')
const chatOfferClear = document.getElementById('chat-offer-clear')

const CHAT_QUICK_REPLIES = ['Is this still available?', "What's your best price?", 'Where can we meet?', 'Can you deliver?']
const CHAT_GROUP_MS = 5 * 60 * 1000
const CHAT_POLL_MS = 8000
const CHAT_ICON_TICK = '<svg class="chat-tick" viewBox="0 0 16 16" width="14" height="14" aria-label="Sent"><path d="M3 8.6l3.1 3L13 4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const CHAT_ICON_CLOCK = '<svg class="chat-tick" viewBox="0 0 16 16" width="14" height="14" aria-label="Sending"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3.2l2 1.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

let activeMessageContext = null
let chatRows = []
let chatChannel = null
let chatPollTimer = null

function chatIsTouch() {
  return !!window.matchMedia?.('(pointer: coarse)').matches
}

function initialsFromName(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] || '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

function avatarHueFromSeed(seed) {
  let h = 0
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function renderChatAvatar(name, seed, logoUrl) {
  if (!chatAvatarEl) return
  const showInitials = () => {
    chatAvatarEl.textContent = initialsFromName(name)
    chatAvatarEl.style.background = `hsl(${avatarHueFromSeed(seed)} 55% 38%)`
  }
  if (logoUrl && isValidImageUrl(logoUrl)) {
    chatAvatarEl.innerHTML = `<img src="${escapeHtml(logoUrl)}" alt="">`
    chatAvatarEl.style.background = ''
    // Broken or missing logo: show the initials instead of a broken-image icon.
    chatAvatarEl.querySelector('img')?.addEventListener('error', showInitials, { once: true })
    return
  }
  showInitials()
}

function chatCurrencySymbol() {
  const l = activeMessageContext?.listing
  const code = String(l?.price_currency || l?.currency || '').toUpperCase()
  return code === 'USD' ? '$' : code === 'ZAR' ? 'R' : ''
}

function renderChatListingCard(listing) {
  if (!chatListingCard) return
  if (!listing) { chatListingCard.classList.add('hidden'); return }
  const img = getListingImages(listing)[0]
  const thumb = img && isValidImageUrl(img)
    ? `<img class="chat-listing-thumb" src="${escapeHtml(img)}" alt="">`
    : `<span class="chat-listing-thumb">${ICON_LISTINGS}</span>`
  chatListingCard.innerHTML = `${thumb}<div class="chat-listing-info"><span class="chat-listing-title">${escapeHtml(listing.title || 'Listing')}</span><span class="chat-listing-price">${escapeHtml(formatListingPrice(listing))}</span></div>`
  chatListingCard.classList.remove('hidden')
}

function formatChatClock(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatChatDay(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

function setChatStatus(text = '', isError = false) {
  if (!messageStatus) return
  messageStatus.textContent = text
  messageStatus.classList.toggle('is-error', !!isError)
}

function autosizeChatInput() {
  if (!messageInput) return
  const max = 120
  messageInput.style.height = 'auto'
  // scrollHeight ignores the border, so add it back or the box overflows by a couple of px and shows a scrollbar.
  const border = messageInput.offsetHeight - messageInput.clientHeight
  const wanted = messageInput.scrollHeight + border
  messageInput.style.height = `${Math.min(wanted, max)}px`
  messageInput.style.overflowY = wanted > max ? 'auto' : 'hidden'
}

function updateChatSendState() {
  const has = !!(messageInput?.value || '').trim() || !!(messageOfferAmount?.value || '').trim()
  messageSend?.classList.toggle('is-ready', has)
}

function setChatOfferBar(open) {
  if (chatOfferBar) chatOfferBar.classList.toggle('hidden', !open)
  if (chatOfferToggle) {
    chatOfferToggle.classList.toggle('active', !!open)
    chatOfferToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  }
  if (!open && messageOfferAmount) messageOfferAmount.value = ''
  updateChatSendState()
}

function updateChatQuickReplies() {
  if (!chatQuickReplies) return
  const show = !!activeMessageContext && activeMessageContext.mode === 'buyer' && !chatRows.length
  if (show && !chatQuickReplies.childElementCount) {
    chatQuickReplies.innerHTML = CHAT_QUICK_REPLIES.map((t) => `<button type="button" class="chat-chip">${escapeHtml(t)}</button>`).join('')
  }
  chatQuickReplies.classList.toggle('hidden', !show)
}

function renderMessageRows({ forceScroll = false } = {}) {
  if (!messageThread) return
  const ctx = activeMessageContext
  const nearBottom = messageThread.scrollHeight - messageThread.scrollTop - messageThread.clientHeight < 140
  const closedText = counterpartyDeletedText(chatRows.find((row) => deletedCounterpartyRole(row))) || ctx?.closedNotice || ''
  const notice = closedText ? `<div class="chat-notice chat-closed-notice">${escapeHtml(closedText)}</div>` : '<div class="chat-notice">Only you two can see this chat. Messages are deleted after 31 days.</div>'

  if (!chatRows.length) {
    const who = escapeHtml(ctx?.otherName || 'them')
    const hint = ctx?.mode === 'buyer' ? 'Ask a question or make an offer.' : 'Send a message to reply to their offer.'
    messageThread.innerHTML = `${notice}<div class="chat-empty"><strong>No messages yet</strong><span>Say hello to ${who}. ${hint}</span></div>`
  } else {
    const me = String(currentUser?.id || '')
    const sym = chatCurrencySymbol()
    const isNotice = (row) => row?.kind === 'account_closed' && !row.sender_id
    const closeTo = (a, b) => !!a && !!b
      && !isNotice(a) && !isNotice(b)
      && String(a.sender_id) === String(b.sender_id)
      && formatChatDay(a.created_at) === formatChatDay(b.created_at)
      && Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < CHAT_GROUP_MS
    let html = notice
    let lastDay = ''
    chatRows.forEach((row, i) => {
      const prev = chatRows[i - 1]
      const next = chatRows[i + 1]
      const day = formatChatDay(row.created_at)
      if (day !== lastDay) html += `<div class="chat-day"><span>${escapeHtml(day)}</span></div>`
      lastDay = day
      if (isNotice(row)) {
        html += `<div class="chat-day chat-system"><span>${escapeHtml(String(row.body || 'This account was deleted.'))}</span></div>`
        return
      }
      const mine = String(row.sender_id) === me
      const isStart = !closeTo(prev, row)
      const isEnd = !closeTo(row, next)
      const amount = row.offer_amount != null && Number.isFinite(Number(row.offer_amount)) ? Number(row.offer_amount) : null
      const body = String(row.body || '')
      // When the buyer sends only an amount, the body is auto-generated. The offer card says it already.
      const autoBody = amount != null && /^I'd like to offer [\d.]+ for this listing\.$/.test(body)
      const offerHtml = amount != null
        ? `<div class="chat-offer"><span class="chat-offer-tag">Offer</span><strong>${escapeHtml(sym + amount.toFixed(2))}</strong></div>`
        : ''
      const textHtml = body && !autoBody ? `<span class="chat-text">${escapeHtml(body)}</span>` : ''
      const tick = mine ? (row._pending ? CHAT_ICON_CLOCK : CHAT_ICON_TICK) : ''
      const cls = `chat-row ${mine ? 'mine' : 'theirs'}${isStart ? ' is-start' : ''}${isEnd ? ' is-end' : ''}${row._pending ? ' is-pending' : ''}`
      html += `<div class="${cls}"><div class="chat-bubble"><div class="chat-bubble-content">${offerHtml}${textHtml}</div><span class="chat-meta">${escapeHtml(formatChatClock(row.created_at))}${tick}</span></div></div>`
    })
    messageThread.innerHTML = html
  }

  if (forceScroll || nearBottom) messageThread.scrollTop = messageThread.scrollHeight
  updateChatQuickReplies()
}

// Adds new rows (from a fetch, a realtime push or our own insert) without duplicates.
function setChatClosedState(closed) {
  if (messageInput) { messageInput.disabled = closed; messageInput.placeholder = closed ? 'Conversation closed' : 'Message' }
  if (messageSend) messageSend.disabled = closed
  if (chatOfferToggle) chatOfferToggle.disabled = closed
  messageInput?.closest('.chat-composer')?.classList.toggle('is-closed', closed)
  if (closed) { setChatOfferBar(false); chatQuickReplies?.classList.add('hidden') }
}

function mergeChatRows(newRows = [], { forceScroll = false } = {}) {
  const ctx = activeMessageContext
  if (!ctx || !currentUser) return
  const me = String(currentUser.id)
  const other = String(ctx.otherUserId || '')
  const byId = new Map(chatRows.filter((r) => !r._pending).map((r) => [String(r.id), r]))
  for (const r of newRows || []) {
    if (!r) continue
    if (ctx.conversationKey && r.conversation_key) {
      if (String(r.conversation_key) !== String(ctx.conversationKey)) continue
    } else {
      if (String(r.listing_id || '') !== String(ctx.listingId || '')) continue
      const pair = [String(r.sender_id || ''), String(r.receiver_id || '')]
      if (!pair.includes(me) || !pair.includes(other)) continue
    }
    byId.set(String(r.id), r)
  }
  const confirmed = [...byId.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const pending = chatRows.filter((r) => r._pending)
  const before = chatRows.map((r) => r.id).join('|')
  chatRows = confirmed.concat(pending)
  if (!ctx.closed && chatRows.some((r) => deletedCounterpartyRole(r))) {
    ctx.closed = true
    setChatClosedState(true)
    if (messageListingTitle) messageListingTitle.textContent = 'Conversation closed'
  }
  if (!forceScroll && chatRows.map((r) => r.id).join('|') === before) return
  renderMessageRows({ forceScroll })
}

async function loadMessageThread({ quiet = false, forceScroll = false } = {}) {
  const ctx = activeMessageContext
  if (!useSupabase || !ctx || !currentUser) return
  const { listingId, otherUserId } = ctx
  if (!listingId && !ctx.conversationKey) return
  if (!quiet) setChatStatus('')
  let query = db.from('listing_messages')
    .select('id,listing_id,listing_title_snapshot,listing_image_snapshot,listing_owner_id_snapshot,conversation_key,sender_id,receiver_id,sender_role,kind,body,offer_amount,created_at')
    .order('created_at', { ascending: true })
  if (ctx.conversationKey) query = query.eq('conversation_key', ctx.conversationKey)
  else {
    const filter = `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`
    query = query.eq('listing_id', listingId).or(filter)
  }
  const { data, error } = await query
  if (error) throw error
  if (ctx !== activeMessageContext) return
  mergeChatRows(data || [], { forceScroll })
}

function stopChatLive() {
  if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null }
  if (chatChannel) {
    try { db.removeChannel(chatChannel) } catch { /* ignore */ }
    chatChannel = null
  }
}

// Realtime gives instant delivery. The light poll is a safety net in case
// Realtime isn't enabled for the table yet, so chats still update on their own.
function startChatLive() {
  stopChatLive()
  const ctx = activeMessageContext
  if (!ctx || !useSupabase || !currentUser) return
  try {
    if (typeof db.channel === 'function') {
      chatChannel = db.channel(`listing-chat-${ctx.listingId}-${currentUser.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listing_messages', filter: ctx.conversationKey ? `conversation_key=eq.${ctx.conversationKey}` : `listing_id=eq.${ctx.listingId}` }, (payload) => {
          if (ctx !== activeMessageContext || !payload?.new) return
          mergeChatRows([payload.new])
        })
        .subscribe()
    }
  } catch (e) {
    console.warn('Realtime chat unavailable, using polling only:', e)
  }
  chatPollTimer = setInterval(() => {
    if (ctx !== activeMessageContext || document.hidden) return
    loadMessageThread({ quiet: true }).catch(() => {})
  }, CHAT_POLL_MS)
}

// On phones the on-screen keyboard shrinks the visual viewport; keep the
// composer glued to the top of the keyboard like a normal chat app.
function syncChatViewport() {
  if (!messageOverlay || messageOverlay.classList.contains('hidden')) return
  const vv = window.visualViewport
  if (!vv || window.innerWidth > 640) {
    messageOverlay.style.height = ''
    messageOverlay.style.top = ''
    return
  }
  messageOverlay.style.height = `${vv.height}px`
  messageOverlay.style.top = `${vv.offsetTop}px`
  if (messageThread) messageThread.scrollTop = messageThread.scrollHeight
}
window.visualViewport?.addEventListener('resize', syncChatViewport)
window.visualViewport?.addEventListener('scroll', syncChatViewport)

async function openMessageThread(listing, otherUserId, mode = 'buyer', otherName = '', seedRow = null) {
  if (!currentUser || !listing || (!otherUserId && !seedRow?.conversation_key) || !useSupabase) {
    if (!useSupabase) alert('Messaging needs the Supabase database to be set up first.')
    return
  }
  const accountGone = !otherUserId // the other person deleted their account
  const listingGone = !listing.id // the listing was removed, only the saved title/photo are left
  const closed = accountGone || listingGone
  const deletedRole = seedRow ? deletedCounterpartyRole(seedRow) : ''
  const store = otherUserId ? getStoreForUser(otherUserId) : null
  let name = accountGone ? `${deletedRole ? deletedRole.charAt(0).toUpperCase() + deletedRole.slice(1) : 'Other person'} deleted account` : String(otherName || store?.name || (mode === 'seller' ? 'Buyer' : 'Seller')).trim()
  if (name.includes('@')) name = getDisplayNameFromEmail(name)
  const conversationKey = seedRow?.conversation_key || messageConversationKey(listing.id, currentUser.id, otherUserId)
  const ctx = { listingId: listing.id, otherUserId: otherUserId ? String(otherUserId) : '', mode, listing, otherName: name, conversationKey, closed, closedNotice: accountGone ? (seedRow ? counterpartyDeletedText(seedRow) : '') : (listingGone ? 'This listing was removed. You can still read this conversation, but you can’t send new messages about it.' : '') }
  activeMessageContext = ctx
  chatRows = []

  if (messageTitle) messageTitle.textContent = name
  if (messageListingTitle) messageListingTitle.textContent = accountGone ? 'Conversation closed' : (listingGone ? 'Listing removed' : (mode === 'seller' ? 'Buyer' : 'Seller'))
  renderChatAvatar(accountGone ? '?' : name, otherUserId || 'deleted-account', store?.logo_url)
  renderChatListingCard(listing)
  if (messageInput) { messageInput.value = ''; autosizeChatInput() }
  setChatOfferBar(false)
  setChatStatus('')
  // Only buyers attach an offer amount; a seller is replying to an existing offer.
  if (chatOfferToggle) chatOfferToggle.classList.toggle('hidden', closed || mode === 'seller')
  if (messageInput) { messageInput.disabled = closed; messageInput.placeholder = closed ? 'Conversation closed' : 'Message' }
  if (messageSend) messageSend.disabled = closed
  if (chatOfferToggle) chatOfferToggle.disabled = closed
  const chatComposer = messageInput?.closest('.chat-composer')
  chatComposer?.classList.toggle('is-closed', closed)
  if (chatQuickReplies) chatQuickReplies.innerHTML = ''

  if (messageOverlay) {
    messageOverlay.classList.remove('hidden')
    messageOverlay.setAttribute('aria-hidden', 'false')
    document.documentElement.classList.add('lightbox-open')
  }
  renderMessageRows({ forceScroll: true })
  syncChatViewport()
  startChatLive()
  try {
    await loadMessageThread({ forceScroll: true })
  } catch (e) {
    console.warn('Loading messages failed:', e)
    if (ctx !== activeMessageContext) return
    setChatStatus('Could not load messages.', true)
    chatQuickReplies?.classList.add('hidden')
    if (messageThread) messageThread.innerHTML = '<div class="chat-empty"><strong>Messages are not available yet</strong><span>Run the messaging SQL in Supabase, then reopen this chat.</span></div>'
  }
  // Don't pop the keyboard over the conversation on phones.
  if (!chatIsTouch()) setTimeout(() => messageInput?.focus(), 30)
}

function closeMessageThread() {
  if (!messageOverlay) return
  stopChatLive()
  messageOverlay.classList.add('hidden')
  messageOverlay.setAttribute('aria-hidden', 'true')
  messageOverlay.style.height = ''
  messageOverlay.style.top = ''
  document.documentElement.classList.remove('lightbox-open')
  activeMessageContext = null
  chatRows = []
  const chatComposer = messageInput?.closest('.chat-composer')
  chatComposer?.classList.remove('is-closed')
  if (messageInput) { messageInput.disabled = false; messageInput.placeholder = 'Message' }
  if (messageSend) messageSend.disabled = false
  if (chatOfferToggle) chatOfferToggle.disabled = false
}

messageClose?.addEventListener('click', closeMessageThread)
messageOverlay?.addEventListener('click', (event) => {
  if (event.target === messageOverlay) closeMessageThread()
})

async function sendMessage() {
  const ctx = activeMessageContext
  if (!ctx || ctx.closed || !currentUser || !useSupabase) return
  const body = (messageInput?.value || '').trim()
  const rawAmount = (messageOfferAmount?.value || '').trim()
  const isBuyer = ctx.mode === 'buyer'
  const amount = isBuyer && rawAmount ? Number(rawAmount.replace(/[^0-9.]/g, '')) : null
  if (isBuyer && rawAmount && (!Number.isFinite(amount) || amount <= 0)) {
    setChatStatus('Enter a valid offer amount.', true)
    messageOfferAmount?.focus()
    return
  }
  // The amount is optional. A buyer may start with a normal message and add an offer whenever they want.
  if (!body && !amount) return

  const messageBody = body || `I'd like to offer ${amount.toFixed(2)} for this listing.`
  const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // Optimistic bubble so it feels instant, like any chat app.
  chatRows.push({
    id: tempId, _pending: true, listing_id: ctx.listingId,
    sender_id: currentUser.id, receiver_id: ctx.otherUserId,
    body: messageBody, offer_amount: amount, created_at: new Date().toISOString(),
    conversation_key: ctx.conversationKey, sender_role: String(ctx.mode || 'buyer') === 'seller' ? 'seller' : 'buyer',
    listing_title_snapshot: ctx.listing?.title || 'Listing', listing_image_snapshot: getListingImages(ctx.listing || {})[0] || null, listing_owner_id_snapshot: ctx.listing?.user_id || null,
  })
  if (messageInput) { messageInput.value = ''; autosizeChatInput() }
  setChatOfferBar(false)
  setChatStatus('')
  renderMessageRows({ forceScroll: true })
  if (!chatIsTouch()) messageInput?.focus()

  try {
    const listingImages = getListingImages(ctx.listing || {}).filter(isValidImageUrl)
    const senderRole = String(ctx.mode || 'buyer') === 'seller' ? 'seller' : 'buyer'
    const { data, error: messageError } = await db.from('listing_messages').insert([{
      listing_id: ctx.listingId,
      listing_title_snapshot: ctx.listing?.title || 'Listing',
      listing_image_snapshot: listingImages[0] || null,
      listing_owner_id_snapshot: ctx.listing?.user_id || null,
      conversation_key: ctx.conversationKey,
      sender_id: currentUser.id,
      receiver_id: ctx.otherUserId,
      sender_role: senderRole,
      body: messageBody,
      offer_amount: amount,
    }]).select('id,listing_id,listing_title_snapshot,listing_image_snapshot,listing_owner_id_snapshot,conversation_key,sender_id,receiver_id,sender_role,kind,body,offer_amount,created_at').single()
    if (messageError) throw messageError

    // Keep the older offers table in sync when it exists, but never let a legacy offers-table error
    // prevent the actual buyer/seller message from being delivered. Seller offers are read from messages.
    if (amount) {
      const buyerName = currentUser.user_metadata?.full_name || currentUser.email || 'A buyer'
      const { error: offerError } = await db.from('offers').insert([{
        listing_id: ctx.listingId,
        buyer_id: currentUser.id,
        seller_id: ctx.otherUserId,
        amount,
        buyer_name: buyerName,
        buyer_contact: currentUser.email || null,
      }])
      if (offerError) console.warn('Legacy offers table could not be updated; message was still sent:', offerError.message)
    }
    if (ctx !== activeMessageContext) return
    chatRows = chatRows.filter((r) => r.id !== tempId)
    mergeChatRows([data], { forceScroll: true })
  } catch (e) {
    console.warn('Message send failed:', e)
    if (ctx !== activeMessageContext) return
    chatRows = chatRows.filter((r) => r.id !== tempId)
    // Put the text back so nothing the person typed is lost.
    if (messageInput && !messageInput.value) { messageInput.value = body; autosizeChatInput() }
    if (amount) { setChatOfferBar(true); if (messageOfferAmount) messageOfferAmount.value = String(amount) }
    updateChatSendState()
    renderMessageRows({ forceScroll: true })
    setChatStatus(e?.message || 'Could not send. Try again.', true)
  }
}

messageSend?.addEventListener('click', sendMessage)
messageInput?.addEventListener('input', () => { autosizeChatInput(); updateChatSendState() })
messageInput?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  // Phones: Enter adds a new line and the send button sends. Desktop: Enter sends, Shift+Enter adds a line.
  if (chatIsTouch()) return
  event.preventDefault()
  sendMessage()
})
messageOfferAmount?.addEventListener('input', updateChatSendState)
messageOfferAmount?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return
  event.preventDefault()
  sendMessage()
})
chatOfferToggle?.addEventListener('click', () => {
  const opening = chatOfferBar?.classList.contains('hidden')
  setChatOfferBar(!!opening)
  if (opening) setTimeout(() => messageOfferAmount?.focus(), 30)
})
chatOfferClear?.addEventListener('click', () => setChatOfferBar(false))
chatQuickReplies?.addEventListener('click', (event) => {
  const chip = event.target.closest('.chat-chip')
  if (!chip || !messageInput) return
  messageInput.value = chip.textContent || ''
  autosizeChatInput()
  updateChatSendState()
  messageInput.focus()
})

async function fetchSellerOfferMessages(listingIds) {
  if (!useSupabase || !currentUser || !listingIds.length) return []
  const idSet = new Set(listingIds.map(String))
  const { data, error } = await db.from('listing_messages')
    .select('id,listing_id,sender_id,body,offer_amount,created_at')
    .eq('receiver_id', currentUser.id)
    .not('offer_amount', 'is', null)
    .order('created_at', { ascending: false })
    .limit(250)
  if (error) throw error
  return (data || []).filter((row) => idSet.has(String(row.listing_id)))
}

async function loadOffersForMyListings(listingIds) {
  if (!useSupabase || !currentUser || !listingIds.length) return
  try {
    const data = await fetchSellerOfferMessages(listingIds)
    const byListing = {}
    for (const offer of data) {
      const key = String(offer.listing_id)
      if (!byListing[key]) byListing[key] = []
      byListing[key].push(offer)
    }
    for (const id of listingIds) {
      const offers = byListing[String(id)]
      if (!offers?.length) continue
      const card = myListingsGrid.querySelector(`[data-listing-id="${CSS.escape(String(id))}"]`)
      if (!card) continue
      const rows = offers.slice(0, 5).map((o) => {
        const amountStr = Number.isFinite(Number(o.offer_amount)) ? Number(o.offer_amount).toFixed(2) : o.offer_amount
        const preview = String(o.body || '').trim()
        return `<div class="offer-row"><div><strong>R${escapeHtml(amountStr)}</strong><span class="offer-row-message">${escapeHtml(preview || 'Offer sent')}</span></div><div class="message-quick-row"><button class="message-buyer-btn muted-btn" type="button" data-id="${escapeHtml(id)}" data-buyer-id="${escapeHtml(o.sender_id || '')}" data-buyer-name="Buyer">Message</button></div></div>`
      }).join('')
      const box = document.createElement('div')
      box.className = 'offers-box'
      box.innerHTML = `<div class="offers-box-title">${offers.length} offer${offers.length === 1 ? '' : 's'} on this listing</div>${rows}`
      card.appendChild(box)
    }
  } catch (e) {
    console.warn('Loading listing offers failed:', e)
  }
}

async function loadSellerOfferSummary(listingIds) {
  if (!myListingsOffersBtn || !myListingsOffersPanel || !useSupabase || !currentUser || !listingIds.length) return
  try {
    const data = await fetchSellerOfferMessages(listingIds)
    if (!data.length) {
      myListingsOffersBtn.classList.add('hidden')
      return
    }
    myListingsOffersBtn.textContent = `Offers (${data.length})`
    myListingsOffersBtn.classList.remove('hidden')
    myListingsOffersBtn.onclick = () => {
      myListingsOffersPanel.classList.toggle('hidden')
    }
    const rows = data.slice(0, 50).map((o) => {
      const listing = currentListings.find((l) => String(l.id) === String(o.listing_id))
      const title = listing?.title || 'Listing'
      const body = String(o.body || '').trim()
      const amount = Number.isFinite(Number(o.offer_amount)) ? `R${Number(o.offer_amount).toFixed(2)}` : 'Offer'
      return `<div class="offer-summary-row">
        <div class="offer-summary-copy">
          <strong>${escapeHtml(title)}</strong>
          <span class="offer-summary-amount">Offer ${escapeHtml(amount)}</span>
          <small>${escapeHtml(body || 'The buyer sent a price offer.')}</small>
          <time>${escapeHtml(formatNotificationTime(o.created_at))}</time>
        </div>
        <button class="message-buyer-btn muted-btn" type="button" data-id="${escapeHtml(o.listing_id)}" data-buyer-id="${escapeHtml(o.sender_id)}" data-buyer-name="Buyer">Open chat</button>
      </div>`
    }).join('')
    myListingsOffersPanel.innerHTML = `<div class="offers-summary-head"><div><strong>Offers from buyers</strong><small>Price offers sent for your listings. Open the chat to continue.</small></div><span>${data.length}</span></div>${rows}`
  } catch (e) {
    myListingsOffersBtn.classList.add('hidden')
    console.warn('Loading seller offers failed:', e)
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
  const featured = new Set((storeDesignsById[String(activeStoreUserId)]?.featured_ids || []).map(String))
  const sorted = sortListings(items)
  const ordered = [...sorted.filter((i) => featured.has(String(i.id))), ...sorted.filter((i) => !featured.has(String(i.id)))]
  ordered.forEach((item) => {
    renderListing(item, storeGrid)
    if (featured.has(String(item.id))) storeGrid.lastElementChild?.classList.add('listing-featured')
  })
}

// Opens the store/marketplace view for a given seller, reading their name,
// bio, and banner from the stores table (falls back gracefully if missing).
function openStore(userId) {
  if (!storeOverlay || !userId) return
  activeStoreUserId = userId
  const s = getStoreForUser(userId)
  if (storeNameHeading) storeNameHeading.textContent = s?.name || 'Seller Marketplace'
  if (storeBioEl) { const copy=[s?.tagline,s?.bio].filter(Boolean).join('\n'); storeBioEl.textContent=copy; storeBioEl.style.whiteSpace=s?.tagline&&s?.bio?'pre-line':'' }
  if (storeCategoryEl) {
    storeCategoryEl.textContent = s?.category || ''
    storeCategoryEl.classList.toggle('hidden', !s?.category)
  }
  if (storeLogoImg) {
    const logoFallback = document.getElementById('store-logo-fallback')
    logoFallback?.classList.add('hidden')
    if (s?.logo_url) {
      storeLogoImg.onerror = () => {
        storeLogoImg.classList.add('hidden')
        if (!logoFallback) return
        logoFallback.textContent = initialsFromName(s?.name)
        logoFallback.style.background = `hsl(${avatarHueFromSeed(userId)} 55% 38%)`
        logoFallback.classList.remove('hidden')
      }
      storeLogoImg.src = s.logo_url
      storeLogoImg.classList.remove('hidden')
    } else {
      storeLogoImg.onerror = null
      storeLogoImg.src = ''
      storeLogoImg.classList.add('hidden')
    }
  }
  if (storeContactMeta) {
    const bits = []
    if (s?.phone) bits.push(`<span>📞 ${escapeHtml(s.phone)}</span>`)
    if (s?.location) bits.push(`<span>📍 ${escapeHtml(s.location)}</span>`)
    if (s?.address) bits.push(`<span>⌖ ${escapeHtml(s.address)}</span>`)
    if (s?.opening_hours) bits.push(`<span>🕒 ${escapeHtml(s.opening_hours)}</span>`)
    if (s?.fulfilment) bits.push(`<span>🚚 ${escapeHtml(s.fulfilment)}</span>`)
    if (s?.business_type) bits.push(`<span>🏷️ ${escapeHtml(s.business_type)}</span>`)
    { const site = safeWebUrl(s?.website_url); if (site) bits.push(`<a href="${escapeHtml(site)}" target="_blank" rel="noopener noreferrer">🌐 Website</a>`) }
    if (s?.whatsapp) { const digits=String(s.whatsapp).replace(/[^0-9+]/g,''); bits.push(`<a href="https://wa.me/${encodeURIComponent(digits.replace(/^\+/,''))}" target="_blank" rel="noopener">💬 WhatsApp</a>`) }
    { const ig = safeWebUrl(s?.instagram_url); if (ig) bits.push(`<a href="${escapeHtml(ig)}" target="_blank" rel="noopener noreferrer">◎ Instagram</a>`) }
    storeContactMeta.innerHTML=bits.join('')
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
  applyStoreDesign(userId)
  renderStoreRatingChip(userId)
  mountReviews(document.getElementById('store-reviews-mount'), { kind: 'seller', targetId: userId, ownerId: userId })
  recordStoreVisit(userId)
  document.getElementById('store-dashboard-btn')?.classList.toggle('hidden', !(currentUser && String(currentUser.id) === String(userId)))
  renderStoreListings()
  storeOverlay.classList.remove('hidden')
  storeOverlay.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
  const params = new URLSearchParams(window.location.search)
  params.set('store', userId)
  history.replaceState(history.state, '', `${window.location.pathname}?${params.toString()}`)
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
    history.replaceState(history.state, '', window.location.pathname + (query ? `?${query}` : ''))
  }
}

storeClose?.addEventListener('click', closeStore)
storeShareBtn?.addEventListener('click', shareActiveStore)
storeEditBtn?.addEventListener('click', () => openStoreManage())
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

// --- "Explore businesses" home-page grid: a lightweight directory of every
// seller who has set up a store, so shoppers can browse businesses (not just
// listings) without searching. Reads the same storesById/currentListings
// state the seller-store overlay uses — this was previously never wired up,
// so the section rendered with an empty grid.
const businessExploreSection = document.getElementById('business-explore')
const businessExploreGrid = document.getElementById('business-explore-grid')

function renderBusinessExploreGrid() {
  if (!businessExploreGrid) return

  const stores = Object.values(storesById || {})
    .filter((store) => store && store.name)
    .map((store) => {
      const ownerId = String(store.user_id || store.id || '')
      const listingCount = currentListings.filter((item) =>
        String(item.user_id || item.seller_id || '') === ownerId && !item.sold
      ).length
      return { ...store, ownerId, listingCount }
    })
    .sort((a, b) => b.listingCount - a.listingCount)
    .slice(0, 12)

  if (businessExploreSection) businessExploreSection.style.display = stores.length ? '' : 'none'
  if (!stores.length) { businessExploreGrid.innerHTML = ''; return }

  businessExploreGrid.innerHTML = stores.map((store) => {
    const countLabel = `${store.listingCount} listing${store.listingCount === 1 ? '' : 's'}`
    const meta = [store.category, store.location || store.city].filter(Boolean).join(' • ')
    const logo = store.logo_url
      ? `<div class="business-explore-logo"><img src="${escapeHtml(store.logo_url)}" alt="" loading="lazy" data-logo-name="${escapeHtml(store.name || '')}" data-logo-seed="${escapeHtml(store.ownerId || '')}"></div>`
      : `<div class="business-explore-icon">${ICON_STORE}</div>`
    const hasWhatsApp = !!buildWhatsAppUrl(store.phone)
    return `
      <div class="business-explore-card" data-owner-id="${escapeHtml(store.ownerId)}" role="button" tabindex="0">
        <div class="business-explore-card-top">
          ${logo}
          <div style="min-width:0">
            <div class="business-explore-name">${escapeHtml(store.name)}</div>
            <div class="business-explore-meta">${escapeHtml(meta ? `${meta} • ${countLabel}` : countLabel)}</div>
          </div>
        </div>
        ${store.bio ? `<div class="business-explore-bio">${escapeHtml(store.bio)}</div>` : ''}
        <div class="business-explore-actions">
          <button type="button" class="hero-btn hero-btn-primary business-explore-view-btn">View Store</button>
          ${hasWhatsApp ? `<button type="button" class="muted-btn business-explore-contact-btn">WhatsApp</button>` : ''}
        </div>
      </div>
    `
  }).join('')

  businessExploreGrid.querySelectorAll('.business-explore-card').forEach((card) => {
    const ownerId = card.dataset.ownerId
    const store = stores.find((s) => s.ownerId === ownerId)
    const openThisStore = () => openStore(ownerId)
    card.addEventListener('click', (ev) => { if (!ev.target.closest('button')) openThisStore() })
    card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openThisStore() } })
    card.querySelector('.business-explore-view-btn')?.addEventListener('click', openThisStore)
    const contactBtn = card.querySelector('.business-explore-contact-btn')
    if (contactBtn && store) {
      const url = buildWhatsAppUrl(store.phone)
      contactBtn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        if (url) window.open(url, '_blank', 'noopener')
      })
    }
  })
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
const storeManageType = document.getElementById('store-manage-type')
const storeManageTagline = document.getElementById('store-manage-tagline')
const storeManageWebsite = document.getElementById('store-manage-website')
const storeManageWhatsapp = document.getElementById('store-manage-whatsapp')
const storeManageInstagram = document.getElementById('store-manage-instagram')
const storeManageLocation = document.getElementById('store-manage-location')
const storeManageAddress = document.getElementById('store-manage-address')
const storeManageBio = document.getElementById('store-manage-bio')
const storeManageHours = document.getElementById('store-manage-hours')
const storeManageFulfilment = document.getElementById('store-manage-fulfilment')
const storeManageLogo = document.getElementById('store-manage-logo')
const storeManageLogoPreview = document.getElementById('store-manage-logo-preview')
storeManageLogoPreview?.addEventListener('error', () => storeManageLogoPreview.classList.add('hidden'))
const storeManageBanner = document.getElementById('store-manage-banner')
const storeManageBannerPreview = document.getElementById('store-manage-banner-preview')
const storeManageMsg = document.getElementById('store-manage-msg')
const storeManageViewBtn = document.getElementById('store-manage-view')
const storeManageSave = document.getElementById('store-manage-save')
const storeManageDeleteBtn = document.getElementById('store-manage-delete')
const storeManageShareBtn = document.getElementById('store-manage-share')
const storeUseAccountNameBtn = document.getElementById('store-use-account-name')

function openStoreManage() {
  if (!storeManageOverlay || !currentUser) return
  const mine = getStoreForUser(currentUser.id)
  storeManageHeading.textContent = mine?.name ? 'My Store' : 'Open Your Store'
  storeManageIntro.textContent = mine?.name
    ? 'Update your storefront and keep your business listings together in one place.'
    : "You do not need your own website. Open a free LinkHub storefront, add your products as listings, and share one link with customers."
  storeManageName.value = mine?.name || ''
  storeManageCategory.value = mine?.category || ''
  storeManageType.value = mine?.business_type || ''
  storeManageTagline.value = mine?.tagline || ''
  storeManagePhone.value = mine?.phone || ''
  storeManageWebsite.value = mine?.website_url || ''
  storeManageWhatsapp.value = mine?.whatsapp || ''
  storeManageInstagram.value = mine?.instagram_url || ''
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
  populateStoreDesignForm()
  if(!mine?.name && restoreStoreDraft()){ storeManageMsg.textContent='Your unfinished store setup was restored.'; window.linkhubRefreshStoreUx?.(); renderDesignPreview() }
  storeManageViewBtn.style.display = mine?.name ? '' : 'none'
  storeManageShareBtn?.classList.toggle('hidden', !mine?.name)
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
  // The store page can still be open underneath (Edit store): refresh it so it shows what was just saved.
  if (currentUser && activeStoreUserId && String(activeStoreUserId) === String(currentUser.id) && storeOverlay && !storeOverlay.classList.contains('hidden')) {
    openStore(activeStoreUserId)
  }
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
  const business_type = storeManageType.value
  const tagline = storeManageTagline.value.trim()
  const phone = storeManagePhone.value.trim()
  const website_url = storeManageWebsite.value.trim()
  const whatsapp = storeManageWhatsapp.value.trim()
  const instagram_url = storeManageInstagram.value.trim()
  const location = storeManageLocation.value.trim()
  const address = storeManageAddress.value.trim()
  const bio = storeManageBio.value.trim()
  const opening_hours = storeManageHours.value.trim()
  const fulfilment = storeManageFulfilment.value
  if (!name) { storeManageMsg.textContent = 'Please enter a store name.'; return }
  const normalizeUrl = (value) => value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : null
  const websiteValue = normalizeUrl(website_url)
  const instagramValue = normalizeUrl(instagram_url)
  if (!useSupabase) { storeManageMsg.textContent = 'Stores need a live Supabase connection to save.'; return }

  storeManageMsg.textContent = 'Saving…'
  const existingStore = getStoreForUser(currentUser.id)
  let banner_url = existingStore?.banner_url || null
  let logo_url = existingStore?.logo_url || null
  let uploadedBannerPath = null
  let uploadedLogoPath = null
  const storage = db.storage.from(STORE_ASSETS_BUCKET)

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
    let payload = { id: currentUser.id, name, category, business_type, tagline, phone, website_url: websiteValue, whatsapp, instagram_url: instagramValue, location, address, bio, opening_hours, fulfilment, logo_url, banner_url, updated_at: new Date().toISOString() }
    let { error: storeErr } = await db.from('stores').upsert(payload)

    // Some existing stores-table SQL schemas use user_id instead of id.
    // Keep the existing SQL untouched and support either frontend shape.
    if (storeErr && /column.*(id|business_type|tagline|website_url|whatsapp|instagram_url)|not.?null.*id|user_id|duplicate key|schema cache/i.test(storeErr.message || '')) {
      // Backwards compatibility for older stores-table schemas that do not yet
      // have the new business profile columns.
      payload = { id: currentUser.id, name, category, phone, location, address, bio, opening_hours, fulfilment, logo_url, banner_url, updated_at: new Date().toISOString() }
      const retry = await db.from('stores').upsert(payload)
      storeErr = retry.error
      if (storeErr && /column.*id|user_id|not.?null.*id/i.test(storeErr.message || '')) {
        payload = { user_id: currentUser.id, name, category, phone, location, address, bio, opening_hours, fulfilment, logo_url, banner_url, updated_at: new Date().toISOString() }
        const retryLegacy = await db.from('stores').upsert(payload)
        storeErr = retryLegacy.error
      }
    }
    if (storeErr) throw storeErr

    storesById[String(currentUser.id)] = { ...payload, id: currentUser.id, user_id: currentUser.id }
    const replacedPaths = []
    if (uploadedBannerPath && existingStore?.banner_url && existingStore.banner_url !== banner_url) {
      replacedPaths.push(...extractStoreStoragePaths({ image_url: existingStore.banner_url }))
    }
    if (uploadedLogoPath && existingStore?.logo_url && existingStore.logo_url !== logo_url) {
      replacedPaths.push(...extractStoreStoragePaths({ image_url: existingStore.logo_url }))
    }
    if (replacedPaths.length) {
      try { await storage.remove([...new Set(replacedPaths)]) }
      catch (cleanupErr) { console.warn('Could not remove replaced store images', cleanupErr) }
    }
    const designNote = await saveStoreDesign()
    try{localStorage.removeItem(storeDraftKey())}catch{}
    storeManageMsg.textContent = 'Your store is live. You can now add listings and share your store link with customers.' + designNote
    storeManageViewBtn.style.display = ''
    storeManageShareBtn?.classList.remove('hidden')
    storeManageHeading.textContent = 'My Store'
    await handleAuthChange()
    renderFilteredListings()
    renderBusinessExploreGrid()
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
function storeDraftKey(){return `linkhub-store-draft-${currentUser?.id||'guest'}`}
function saveStoreDraft(){if(!currentUser||!storeManageOverlay||storeManageOverlay.classList.contains('hidden'))return;try{localStorage.setItem(storeDraftKey(),JSON.stringify({name:storeManageName?.value||'',category:storeManageCategory?.value||'',business_type:storeManageType?.value||'',tagline:storeManageTagline?.value||'',phone:storeManagePhone?.value||'',website_url:storeManageWebsite?.value||'',whatsapp:storeManageWhatsapp?.value||'',instagram_url:storeManageInstagram?.value||'',location:storeManageLocation?.value||'',address:storeManageAddress?.value||'',bio:storeManageBio?.value||'',opening_hours:storeManageHours?.value||'',fulfilment:storeManageFulfilment?.value||'',announcement:document.getElementById('store-design-announcement')?.value||''}))}catch{}}
function restoreStoreDraft(){if(!currentUser)return false;try{const d=JSON.parse(localStorage.getItem(storeDraftKey())||'null');if(!d||!Object.values(d).some(v=>String(v||'').trim()))return false;const set=(e,v)=>{if(e&&v!=null)e.value=v};set(storeManageName,d.name);set(storeManageCategory,d.category);set(storeManageType,d.business_type);set(storeManageTagline,d.tagline);set(storeManagePhone,d.phone);set(storeManageWebsite,d.website_url);set(storeManageWhatsapp,d.whatsapp);set(storeManageInstagram,d.instagram_url);set(storeManageLocation,d.location);set(storeManageAddress,d.address);set(storeManageBio,d.bio);set(storeManageHours,d.opening_hours);set(storeManageFulfilment,d.fulfilment);const a=document.getElementById('store-design-announcement');if(a)a.value=d.announcement||'';return true}catch{return false}}
[storeManageName,storeManageCategory,storeManageType,storeManageTagline,storeManagePhone,storeManageWebsite,storeManageWhatsapp,storeManageInstagram,storeManageLocation,storeManageAddress,storeManageBio,storeManageHours,storeManageFulfilment].forEach(el=>el?.addEventListener('input',saveStoreDraft));document.getElementById('store-design-announcement')?.addEventListener('input',saveStoreDraft)
storeManageOverlay?.addEventListener('click', (ev) => {
  if (ev.target === storeManageOverlay) closeStoreManage()
})
storeManageViewBtn?.addEventListener('click', () => {
  if (!currentUser) return
  closeStoreManage()
  openStore(currentUser.id)
})
storeUseAccountNameBtn?.addEventListener('click', () => { const fullName=String(currentUser?.user_metadata?.full_name||'').trim(); if(!fullName){storeManageMsg.textContent='Your account does not have a saved name yet.';return} storeManageName.value=fullName; storeManageName.dispatchEvent(new Event('input',{bubbles:true})); window.linkhubRefreshStoreUx?.(); renderDesignPreview() })
storeManageShareBtn?.addEventListener('click', shareMyStoreLink)

async function deleteMyStore() {
  if (!currentUser || !useSupabase) return
  const existingStore = getStoreForUser(currentUser.id)
  if (!existingStore?.name) return

  const confirmed = window.confirm(`Delete your LinkHub store “${existingStore.name}”? Your store page and store profile will be removed. Your marketplace listings will NOT be deleted.`)
  if (!confirmed) return

  storeManageMsg.textContent = 'Preparing to delete your store…'
  storeManageDeleteBtn.disabled = true
  storeManageSave?.setAttribute('disabled', 'disabled')

  const storage = db.storage.from(STORE_ASSETS_BUCKET)
  const restoreFiles = []
  let storePaths = []
  try {
    const media = [existingStore.banner_url, existingStore.logo_url].filter(Boolean)
    storePaths = [...new Set(media.flatMap((url) => extractStoreStoragePaths({ image_url: url })))]

    // Snapshot the files before deletion so we can restore them if the DB delete fails.
    for (const url of media) {
      const path = extractStoreStoragePaths({ image_url: url })[0]
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
    renderBusinessExploreGrid()
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
let lightboxReturnToListingOverlay = false

function openLightbox(src, returnToListingOverlay = false) {
  if (!src) return
  lightboxReturnToListingOverlay = Boolean(returnToListingOverlay)
  lightboxImg.src = src
  lightbox.classList.remove('hidden')
  lightbox.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
}

function closeLightbox() {
  const shouldCloseListingOverlay = lightboxReturnToListingOverlay
  lightboxReturnToListingOverlay = false
  lightbox.classList.add('hidden')
  lightbox.setAttribute('aria-hidden', 'true')
  lightboxImg.src = ''
  if (shouldCloseListingOverlay) closeListingOverlay()
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
let sellerRatingsById = {}
let storeDesignsById = {}
let myRatingsByListing = {}

// Housekeeping rules: unsold listings auto-expire after 62 days, and sold
// listings are removed 3 days after being marked sold (the seller sees a
// "will be removed on..." notice on their own card before that happens, in
// renderListing, so nothing disappears with no warning). Runs for whichever
// listings the signed-in visitor has delete rights on: their own, or — for
// the site owner — everyone's.
function extractStoragePathsForBucket(listing, bucket) {
  const urls = getListingImages(listing)
  const paths = []
  for (const value of urls) {
    try {
      const url = new URL(value, window.location.href)
      const marker = `/storage/v1/object/public/${bucket}/`
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

// Listing photos live in LISTING_IMAGES_BUCKET.
function extractStoragePaths(listing) {
  return extractStoragePathsForBucket(listing, LISTING_IMAGES_BUCKET)
}

// Store banners/logos live in STORE_ASSETS_BUCKET — a separate bucket, so the
// URL's bucket segment (and therefore the marker we match against) differs
// from listing photos. Accepts the same { image_url } / { image_urls } shape
// as extractStoragePaths so it can be called the same way.
function extractStoreStoragePaths(store) {
  return extractStoragePathsForBucket(store, STORE_ASSETS_BUCKET)
}

async function deleteListingStorageFiles(listing) {
  if (!useSupabase || !db.storage) return
  const paths = extractStoragePaths(listing)
  if (!paths.length) return
  try {
    const { error } = await db.storage.from(LISTING_IMAGES_BUCKET).remove(paths)
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
    await loadRatingsAndDesigns()
    await runListingCleanup()
    renderFilteredListings()
    renderBusinessExploreGrid()
    if (myListingsOverlay && !myListingsOverlay.classList.contains('hidden')) renderMyListings()
    if (storeOverlay && !storeOverlay.classList.contains('hidden')) renderStoreListings()
    else openStoreFromUrlIfPresent()
  } catch (err) {
    const cached = loadStoredJSON('linkhub-last-listings', [])
    if (Array.isArray(cached) && cached.length) {
      currentListings = cached
      renderCategoryChips()
      renderFilteredListings()
      renderBusinessExploreGrid()
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
    updateCategoryScrollControls()
    return
  }
  if (activeCategory && !categories.some(([key]) => key === activeCategory)) activeCategory = ''
  const chips = ['<button type="button" class="category-chip' + (activeCategory === '' ? ' active' : '') + '" data-category="">All</button>']
  for (const [key, label] of categories) {
    chips.push(`<button type="button" class="category-chip${activeCategory === key ? ' active' : ''}" data-category="${escapeHtml(key)}">${escapeHtml(label)}</button>`)
  }
  categoryChipsEl.innerHTML = chips.join('')
  updateCategoryScrollControls()
}

function updateCategoryScrollControls() {
  if (!categoryChipsEl) return
  const maxScroll = categoryChipsEl.scrollWidth - categoryChipsEl.clientWidth
  const hasOverflow = maxScroll > 2
  if (categoryScrollLeftBtn) categoryScrollLeftBtn.disabled = !hasOverflow || categoryChipsEl.scrollLeft <= 2
  if (categoryScrollRightBtn) categoryScrollRightBtn.disabled = !hasOverflow || categoryChipsEl.scrollLeft >= maxScroll - 2
}

categoryScrollLeftBtn?.addEventListener('click', () => {
  categoryChipsEl?.scrollBy({ left: -Math.max(180, categoryChipsEl.clientWidth * 0.75), behavior: 'smooth' })
})

categoryScrollRightBtn?.addEventListener('click', () => {
  categoryChipsEl?.scrollBy({ left: Math.max(180, categoryChipsEl.clientWidth * 0.75), behavior: 'smooth' })
})

categoryChipsEl?.addEventListener('scroll', updateCategoryScrollControls, { passive: true })
window.addEventListener('resize', updateCategoryScrollControls)

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
  if (recentlyViewedReady) renderRecentlyViewed()
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
  const linkedItem = currentListings.find((item) => String(item.id) === String(targetId))
  if (linkedItem) { rememberRecentlyViewed(linkedItem.id); renderSimilarListings(linkedItem) }
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

// Choose the listing Carty should take the user to without changing the
// marketplace result order. Exact title matches win over partial title, then
// keyword/category matches.
function pickBestCartyResult(results, rawTerm, filters) {
  if (!Array.isArray(results) || !results.length) return null
  const keywords = (Array.isArray(filters?.keywords) ? filters.keywords : meaningfulWords(rawTerm))
    .map(v => String(v).trim().toLowerCase())
    .filter(Boolean)
  const query = String(rawTerm || '').trim().toLowerCase()

  let best = results[0]
  let bestScore = -1
  for (const item of results) {
    const title = String(item.title || '').toLowerCase()
    const category = String(item.category || '').toLowerCase()
    const description = String(item.description || '').toLowerCase()
    let score = 0
    if (query && title === query) score += 1000
    if (query && title.includes(query)) score += 500
    for (const keyword of keywords) {
      if (title.includes(keyword)) score += 120
      else if (category.includes(keyword)) score += 60
      else if (description.includes(keyword)) score += 20
    }
    if (score > bestScore) {
      best = item
      bestScore = score
    }
  }
  return best
}

// --- Carty: conversational marketplace assistant ---
// Carty DOM references are declared before any helper that reads them.
// Keeping these near the start of the Carty section prevents a temporal-dead-zone
// error from stopping the whole ES module (which would make the Carty button dead).
const cartyToggle = document.getElementById('carty-toggle')
const cartyPanel = document.getElementById('carty-panel')
const cartyClose = document.getElementById('carty-close')
const cartyForm = document.getElementById('carty-form')
const cartyInput = document.getElementById('carty-input')
const cartyMessage = document.getElementById('carty-message')
const cartyMic = document.getElementById('carty-mic')
const cartyVoiceToggle = document.getElementById('carty-voice-toggle')

// Carty keeps a short conversation history in localStorage and sends one
// request per user message. It can search listings, answer normal questions,
// compare current marketplace options, and add/remove listings from the cart.
const CARTY_HISTORY_PREFIX = 'linkhub-carty-history-v2'
const CARTY_HISTORY_LIMIT = 12

function getCartyHistoryKey() {
  return currentUser?.id
    ? `${CARTY_HISTORY_PREFIX}:user:${currentUser.id}`
    : `${CARTY_HISTORY_PREFIX}:guest`
}

function normalizeCartyHistory(history) {
  return Array.isArray(history)
    ? history
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-CARTY_HISTORY_LIMIT)
    : []
}

let cartyConversation = normalizeCartyHistory(loadStoredJSON(getCartyHistoryKey(), []))

function loadCartyConversationForCurrentUser() {
  cartyConversation = normalizeCartyHistory(loadStoredJSON(getCartyHistoryKey(), []))
  if (cartyMessage) {
    if (cartyConversation.length) renderCartyHistory()
    else cartyMessage.dataset.initialGreeting = '1'
  }
}

function persistCartyConversation() {
  cartyConversation = normalizeCartyHistory(cartyConversation)
  saveStoredJSON(getCartyHistoryKey(), cartyConversation)
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
    condition: item.condition ?? item.url ?? '',
    delivery: item.delivery_type ?? item.fulfilment ?? item.delivery_collection ?? ''
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
    condition: item.condition ?? item.url ?? '',
    delivery: item.delivery_type ?? item.fulfilment ?? item.delivery_collection ?? '',
    sold: Boolean(item.sold)
  }))
}

function getCartyStoreContext() {
  const allStores = Object.values(storesById || {})
    .filter(store => store && (store.name || store.bio || store.category || store.location || store.phone))

  const currentTerm = (searchEl?.value || '').trim().toLowerCase()
  const listingUsers = new Set(
    getScopedListings()
      .slice(0, 24)
      .map(item => String(item.user_id || item.seller_id || ''))
      .filter(Boolean)
  )

  return allStores
    .map(store => {
      const ownerId = String(store.user_id || store.id || '')
      const searchable = [
        store.name,
        store.bio,
        store.category,
        store.location,
        store.city,
        store.address,
        store.opening_hours,
        store.delivery_collection,
        store.fulfilment,
        store.phone
      ].filter(Boolean).join(' ').toLowerCase()

      let score = 0
      if (listingUsers.has(ownerId)) score += 5
      if (currentTerm && searchable.includes(currentTerm)) score += 8
      if (activeCategory && String(store.category || '').toLowerCase() === String(activeCategory).toLowerCase()) score += 6

      return { store, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ store }) => ({
      id: String(store.user_id || store.id || ''),
      name: String(store.name || ''),
      category: String(store.category || ''),
      phone: String(store.phone || ''),
      location: String(store.location || store.city || ''),
      address: String(store.address || ''),
      bio: String(store.bio || '').slice(0, 260),
      opening_hours: String(store.opening_hours || ''),
      delivery_collection: String(store.delivery_collection || store.fulfilment || ''),
      listing_count: getScopedListings().filter(item => String(item.user_id || item.seller_id || '') === String(store.user_id || store.id || '')).length
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
    marketplace_listings: getCartyMarketplaceContext(),
    business_stores: getCartyStoreContext()
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
    .carty-chat-typing{opacity:.78;font-style:normal;display:inline-flex;align-items:center;gap:7px;min-width:72px}
    .carty-thinking-label{font-size:.82rem;color:rgba(255,255,255,.72)}
    .carty-thinking-dots{display:inline-flex;gap:3px;align-items:center;height:10px}
    .carty-thinking-dots i{display:block;width:4px;height:4px;border-radius:50%;background:#71b9ff;opacity:.25;animation:carty-thinking-dot 1.05s ease-in-out infinite}
    .carty-thinking-dots i:nth-child(2){animation-delay:.14s}
    .carty-thinking-dots i:nth-child(3){animation-delay:.28s}
    @keyframes carty-thinking-dot{0%,70%,100%{opacity:.24;transform:translateY(0) scale(.85)}35%{opacity:1;transform:translateY(-2px) scale(1)}}
    @media (prefers-reduced-motion:reduce){.carty-thinking-dots i{animation:none;opacity:.8}}
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
  const label = document.createElement('span')
  label.className = 'carty-thinking-label'
  label.textContent = 'Thinking'
  const dots = document.createElement('span')
  dots.className = 'carty-thinking-dots'
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('i')
    dot.setAttribute('aria-hidden', 'true')
    dots.appendChild(dot)
  }
  bubble.append(label, dots)
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
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        // The Edge Function requires the current user message as `query`.
        // The full recent conversation is sent separately for context.
        query: term,
        history: cartyConversation,
        marketplaceContext: getCartyContext()
      })
    })
    if (!res.ok) throw new Error(`AI request failed (${res.status})`)
    data = await res.json()
  } catch (err) {
    console.warn('Carty request failed:', err)
    return {
      type: 'chat',
      reply: 'Carty is unavailable right now. Please try again in a moment.'
    }
  }

  if (data?.type === 'chat') {
    return { type: 'chat', reply: data.reply || 'I’m here to help you shop on LinkHub.' }
  }

  if (data?.type === 'cart_action' || data?.cart_action?.action) {
    const actionData = data.cart_action || data
    const action = actionData.action === 'remove' ? 'remove' : actionData.action === 'clear' ? 'clear' : 'add'
    const listingId = String(actionData.listing_id || '')

    if (action === 'clear') {
      cartIds.clear()
      persistCart()
      renderCart()
      renderFilteredListings()
      return {
        type: 'cart_action',
        action: 'clear',
        listingId: '',
        reply: data.reply || 'Cleared your cart.'
      }
    }
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
    listingsContainer.innerHTML = `
      <div class="market-empty-state carty-no-match-state">
        <div class="market-empty-icon">⌕</div>
        <h3>Product not found</h3>
        <p class="muted">I couldn’t find that on LinkHub right now. Try another product or browse the listings below.</p>
        <button type="button" class="muted-btn empty-clear-btn">Clear search</button>
      </div>`
    return {
      type: 'search',
      count: 0,
      displayTerm,
      firstResultId: null,
      reply: data.reply || `I couldn’t find that on LinkHub right now. Try another product or browse the listings below.`
    }
  }

  listCount.textContent = `${results.length} listing${results.length === 1 ? '' : 's'}`
  results.slice(0, visibleCount).forEach(item => renderListing(item, listingsContainer))

  return {
    type: 'search',
    count: results.length,
    displayTerm,
    firstResultId: (() => {
      const best = pickBestCartyResult(results, term, filters)
      return best?.id != null ? String(best.id) : null
    })(),
    reply: data.reply || `I found ${results.length} listing${results.length === 1 ? '' : 's'} that match what you described.`
  }
}

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
// Tap anywhere outside the chat window to close it.
document.addEventListener('click', (ev) => {
  if (!cartyPanel || cartyPanel.classList.contains('hidden')) return
  if (ev.target.closest('#carty-panel, #carty-toggle, .carty-fab')) return
  closeCarty()
})

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

  const reply = result.type === 'search' && result.count === 0
    ? `I couldn’t find “${result.displayTerm}” on LinkHub right now. Try another product or browse the live listings.`
    : (result.reply || (result.type === 'search'
      ? `Found ${result.count} listing${result.count === 1 ? '' : 's'} for “${result.displayTerm}”.`
      : 'I’m here to help.'))
  addCartyHistory('assistant', reply)
  appendCartyBubble('assistant', reply)
  speakCarty(reply)

  if (result.type === 'search') {
    // Move the conversation out of the way and put the marketplace result
    // into focus. No result gets the same treatment so the empty state is
    // visible instead of leaving Carty covering the marketplace.
    closeCarty()

    if (result.count > 0) {
      const targetId = result.firstResultId || listingsContainer?.querySelector('[data-listing-id]')?.dataset.listingId
      const card = targetId
        ? listingsContainer?.querySelector(`[data-listing-id="${CSS.escape(String(targetId))}"]`)
        : null

      if (card) {
        card.classList.add('listing-highlight')
        card.scrollIntoView({ behavior: 'smooth', block: 'center' })
        window.setTimeout(() => card.classList.remove('listing-highlight'), 2600)
      } else {
        document.getElementById('feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    } else {
      listingsContainer?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
})

// Carty intentionally opens only when the user taps the button.

// Recently viewed (strip at the top of the feed) + "You might also like" (inside the listing overlay)
const RECENT_VIEWED_KEY = 'linkhub-recently-viewed-v1'
const RECENT_VIEWED_LIMIT = 8
const SIMILAR_LISTINGS_LIMIT = 8
const recentlyViewedSection = document.getElementById('recently-viewed-section')
const recentlyViewedList = document.getElementById('recently-viewed-list')
const clearRecentlyViewedBtn = document.getElementById('clear-recently-viewed')
const recentlyViewedScrollLeftBtn = document.getElementById('recently-viewed-scroll-left')
const recentlyViewedScrollRightBtn = document.getElementById('recently-viewed-scroll-right')
var recentlyViewedReady = false // var on purpose: renderFilteredListings can run before this block is evaluated
let recentlyViewedSig = ''

function updateMiniScrollControls(list, leftButton, rightButton) {
  if (!list) return
  const maxScroll = list.scrollWidth - list.clientWidth
  const hasOverflow = maxScroll > 2
  if (leftButton) leftButton.disabled = !hasOverflow || list.scrollLeft <= 2
  if (rightButton) rightButton.disabled = !hasOverflow || list.scrollLeft >= maxScroll - 2
}

function setupMiniScrollControls(list, leftButton, rightButton) {
  if (!list) return
  leftButton?.addEventListener('click', () => list.scrollBy({ left: -Math.max(220, list.clientWidth * 0.75), behavior: 'smooth' }))
  rightButton?.addEventListener('click', () => list.scrollBy({ left: Math.max(220, list.clientWidth * 0.75), behavior: 'smooth' }))
  list.addEventListener('scroll', () => updateMiniScrollControls(list, leftButton, rightButton), { passive: true })
  updateMiniScrollControls(list, leftButton, rightButton)
}

setupMiniScrollControls(recentlyViewedList, recentlyViewedScrollLeftBtn, recentlyViewedScrollRightBtn)
window.addEventListener('resize', () => {
  updateMiniScrollControls(recentlyViewedList, recentlyViewedScrollLeftBtn, recentlyViewedScrollRightBtn)
})

function getRecentlyViewedIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_VIEWED_KEY) || '[]')
    return Array.isArray(raw) ? raw.map(String).slice(0, RECENT_VIEWED_LIMIT) : []
  } catch { return [] }
}

function saveRecentlyViewedIds(ids) {
  localStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(ids.map(String).slice(0, RECENT_VIEWED_LIMIT)))
}

function rememberRecentlyViewed(listingId) {
  const id = String(listingId || '')
  if (!id) return
  const next = [id, ...getRecentlyViewedIds().filter(x => x !== id)]
  saveRecentlyViewedIds(next)
  renderRecentlyViewed()
}

// Compact vertical card: photo on top, then price, title and location.
function miniListingCard(item) {
  const card = document.createElement('button')
  card.type = 'button'
  card.className = 'mini-listing-card'
  card.dataset.listingId = String(item.id)
  card.setAttribute('aria-label', `Open ${item.title || 'listing'}`)
  const images = getListingImages(item).filter(isValidImageUrl)
  const soldTag = item.sold ? '<span class="mini-sold-tag">Sold</span>' : ''
  const imageHtml = images.length
    ? `<div class="mini-listing-img"><img src="${escapeHtml(images[0])}" alt="" loading="lazy">${soldTag}</div>`
    : `<div class="mini-listing-placeholder">${ICON_STORE}${soldTag}</div>`
  const hasPrice = item.price != null && String(item.price).trim() !== ''
  const price = `<div class="mini-listing-price">${escapeHtml(hasPrice ? formatListingPrice(item) : 'Price on request')}</div>`
  const meta = item.location || item.city || item.category || ''
  card.innerHTML = `${imageHtml}<div class="mini-listing-body">${price}<div class="mini-listing-title">${escapeHtml(item.title || 'Untitled listing')}</div>${meta ? `<div class="mini-listing-meta">${escapeHtml(meta)}</div>` : ''}</div>`
  // Photo can't load: show the placeholder icon instead of a broken image.
  card.querySelector('.mini-listing-img img')?.addEventListener('error', (event) => {
    const wrap = event.target.closest('.mini-listing-img')
    if (!wrap) return
    wrap.className = 'mini-listing-placeholder'
    wrap.innerHTML = `${ICON_STORE}${soldTag}`
  }, { once: true })
  card.addEventListener('click', () => {
    openListingOverlay(item)
  })
  return card
}

// The strip sits above the listings, so hide it while someone is searching or
// filtering by category; the results should come first then.
function renderRecentlyViewed() {
  if (!recentlyViewedSection || !recentlyViewedList) return
  const ids = getRecentlyViewedIds()
  const items = ids.map(id => currentListings.find(item => String(item.id) === id)).filter(Boolean)
  const filtering = !!(searchEl?.value.trim()) || !!activeCategory
  if (!items.length) {
    recentlyViewedList.innerHTML = ''
    recentlyViewedSig = ''
    recentlyViewedSection.classList.add('hidden')
    return
  }
  const sig = items.map(item => `${item.id}:${item.sold ? 1 : 0}`).join('|')
  if (sig !== recentlyViewedSig || !recentlyViewedList.childElementCount) {
    recentlyViewedList.innerHTML = ''
    items.forEach(item => recentlyViewedList.appendChild(miniListingCard(item)))
    recentlyViewedList.scrollLeft = 0
    recentlyViewedSig = sig
  }
  recentlyViewedSection.classList.toggle('hidden', filtering)
  if (!filtering) requestAnimationFrame(() => updateMiniScrollControls(recentlyViewedList, recentlyViewedScrollLeftBtn, recentlyViewedScrollRightBtn))
}

function similarWords(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2)
}

// "You might also like" lives inside the listing overlay (under the seller
// buttons), so it shows up right when someone is looking at a listing.
function renderSimilarListings(baseItem) {
  const section = document.getElementById('listing-overlay-similar')
  const list = document.getElementById('similar-listings-list')
  if (!section || !list || !baseItem) return
  if (section.dataset.itemId !== String(baseItem.id)) return // overlay is showing a different listing
  const baseCategory = String(baseItem.category || '').toLowerCase()
  const baseWords = new Set(similarWords(baseItem.title))
  const basePrice = Number(baseItem.price)
  const basePlace = String(baseItem.location || baseItem.city || '').toLowerCase()
  const ranked = currentListings
    .filter(item => String(item.id) !== String(baseItem.id) && !item.sold)
    .map(item => {
      let score = 0
      if (baseCategory && String(item.category || '').toLowerCase() === baseCategory) score += 5
      score += similarWords(item.title).filter(w => baseWords.has(w)).length * 2
      const related = score > 0 // same category or shared title words; price and place only help with ordering
      const price = Number(item.price)
      if (Number.isFinite(basePrice) && basePrice > 0 && Number.isFinite(price) && price >= basePrice / 2 && price <= basePrice * 2) score += 1
      if (basePlace && String(item.location || item.city || '').toLowerCase() === basePlace) score += 1
      return { item, score, related, time: new Date(item.created_at || 0).getTime() || 0 }
    })
    .sort((a, b) => b.score - a.score || b.time - a.time)
  // Prefer genuinely related listings; if there are only a few, top up with the newest so the row isn't empty.
  let picks = ranked.filter(x => x.related)
  if (picks.length < 4) picks = ranked
  picks = picks.slice(0, SIMILAR_LISTINGS_LIMIT).map(x => x.item)
  list.innerHTML = ''
  if (!picks.length) {
    section.classList.add('hidden')
    return
  }
  picks.forEach(item => list.appendChild(miniListingCard(item)))
  section.classList.remove('hidden')
  const left = document.getElementById('similar-listings-scroll-left')
  const right = document.getElementById('similar-listings-scroll-right')
  setupMiniScrollControls(list, left, right)
  requestAnimationFrame(() => updateMiniScrollControls(list, left, right))
}

clearRecentlyViewedBtn?.addEventListener('click', () => {
  saveRecentlyViewedIds([])
  renderRecentlyViewed()
})

renderRecentlyViewed()
recentlyViewedReady = true

const listingOverlay = document.createElement('div')
listingOverlay.id = 'listing-overlay'
listingOverlay.className = 'lightbox-overlay hidden'
listingOverlay.setAttribute('aria-hidden', 'true')
listingOverlay.innerHTML = `
  <div class="listing-overlay-panel">
    <div class="listing-overlay-topbar">
      <span class="listing-overlay-topbar-title">Listing details</span>
      <button type="button" class="lightbox-close" data-close-listing-overlay aria-label="Close listing">&times;</button>
    </div>
    <div id="listing-overlay-content" class="listing-overlay-content"></div>
  </div>
`
document.body.appendChild(listingOverlay)

function openListingOverlay(item, opts = {}) {
  if (!item || !listingOverlay) return
  const content = document.getElementById('listing-overlay-content')
  if (!content) return

  const images = getListingImages(item).filter(isValidImageUrl)
  const imageHtml = images.length
    ? `<div class="listing-overlay-media">
        <div class="listing-overlay-gallery">
          <img src="${escapeHtml(images[0])}" alt="" aria-hidden="true" class="listing-overlay-backdrop" />
          <div class="listing-overlay-main-btn" aria-label="Product image"><img src="${escapeHtml(images[0])}" alt="${escapeHtml(item.title || 'Listing image')}" class="listing-overlay-main-image" loading="lazy" /></div>
          ${images.length > 1 ? `
            <button type="button" class="listing-overlay-nav-btn prev" aria-label="Previous image">‹</button>
            <button type="button" class="listing-overlay-nav-btn next" aria-label="Next image">›</button>
            <span class="image-count-badge listing-overlay-count">1 / ${images.length}</span>
          ` : ''}
        </div>
        ${images.length > 1 ? `<div class="listing-gallery-thumbs listing-overlay-thumbs">${images.map((src, i) => `<button type="button" class="overlay-gallery-thumb${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="View image ${i + 1}"><img src="${escapeHtml(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
      </div>`
    : `<div class="listing-overlay-media"><div class="listing-overlay-gallery empty"><div class="listing-overlay-empty">${ICON_STORE}</div></div></div>`

  const price = item.price != null && String(item.price).trim() !== '' ? `<div class="listing-overlay-price">${escapeHtml(formatListingPrice(item))}</div>` : ''

  const metaParts = []
  if (item.category) metaParts.push(`<div><strong>Category</strong><span>${escapeHtml(item.category)}</span></div>`)
  if (item.delivery_type) metaParts.push(`<div><strong>Delivery</strong><span>${escapeHtml(item.delivery_type)}</span></div>`)
  if (item.payment_type) metaParts.push(`<div><strong>Payment</strong><span>${escapeHtml(item.payment_type)}</span></div>`)
  if (item.location || item.city) metaParts.push(`<div><strong>Location</strong><span>${escapeHtml(item.location || item.city)}</span></div>`)
  if (item.contact_method) metaParts.push(`<div><strong>Contact method</strong><span>${escapeHtml(item.contact_method)}</span></div>`)
  const meta = metaParts.length ? `<div class="listing-overlay-meta">${metaParts.join('')}</div>` : ''

  let postedHtml = ''
  if (item.created_at) {
    try {
      postedHtml = `<div class="muted listing-posted">Posted: ${escapeHtml(new Date(item.created_at).toLocaleString())}</div>`
    } catch (e) {
      postedHtml = `<div class="muted listing-posted">Posted: ${escapeHtml(item.created_at)}</div>`
    }
  }

  const eyebrowLabel = item.sold ? 'Sold' : (item.category || 'Listing')

  content.innerHTML = `
    ${imageHtml}
    <div class="listing-overlay-body">
      <div class="listing-overlay-header">
        <span class="eyebrow">${escapeHtml(eyebrowLabel)}</span>
        <h2>${escapeHtml(item.title || 'Untitled listing')}</h2>
      </div>
      ${overlayRatingHtml(item)}
      ${price}
      ${meta}
      ${item.description ? `<p class="listing-overlay-description">${escapeHtml(item.description)}</p>` : ''}
      ${postedHtml}
      <div class="listing-overlay-actions">
        <button type="button" class="hero-btn hero-btn-primary" data-overlay-contact-id="${escapeHtml(item.id)}">Contact seller</button>
        <button type="button" class="muted-btn" data-close-listing-overlay>Close</button>
      </div>
      ${item.user_id ? `<div class="seller-review-quick">${sellerRatingQuickHtml(item.user_id)}<button type="button" class="seller-review-open" data-goto-seller-reviews>Rate seller</button></div>` : ""}
      <section id="listing-reviews" class="reviews-section" data-item-id="${escapeHtml(item.id)}" aria-label="Ratings and reviews">
        <h3 class="reviews-heading">Ratings &amp; reviews</h3>
        <div class="reviews-mount"></div>
      </section>
      ${item.user_id ? `<section id="listing-seller-reviews" class="reviews-section seller-reviews-section" data-seller-id="${escapeHtml(item.user_id)}" aria-label="Seller rating"><h3 class="reviews-heading">Seller rating</h3><p class="muted seller-review-help">Review the person you dealt with. A LinkHub store is not required.</p><div class="reviews-mount"></div></section>` : ''}
      <section id="listing-overlay-similar" class="listing-overlay-similar hidden" data-item-id="${escapeHtml(item.id)}" aria-label="You might also like">
        <div class="strip-header">
          <h3 class="strip-title">
            <svg class="section-inline-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="18" height="18"><path d="m12 3 2.3 5.1 5.5.5-4.1 3.6 1.2 5.3-4.9-2.8-4.9 2.8 1.2-5.3-4.1-3.6 5.5-.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>
            You might also like
          </h3>
        </div>
        <div class="strip-scroll">
          <button id="similar-listings-scroll-left" class="strip-arrow left" type="button" aria-label="Scroll left" disabled>&#8249;</button>
          <div id="similar-listings-list" class="mini-listing-grid"></div>
          <button id="similar-listings-scroll-right" class="strip-arrow right" type="button" aria-label="Scroll right" disabled>&#8250;</button>
        </div>
      </section>
    </div>
  `

  // Wire up the photo gallery: thumbnails + prev/next switch the main
  // image and update the counter. The main image itself is intentionally
  // not clickable here, so the product preview cannot open a second
  // image-preview/lightbox on top of the listing preview.
  if (images.length) {
    let activeIndex = 0
    const galleryEl = content.querySelector('.listing-overlay-gallery')
    const mainImg = content.querySelector('.listing-overlay-main-image')
    const backdropImg = content.querySelector('.listing-overlay-backdrop')
    const counter = content.querySelector('.listing-overlay-count')
    const thumbBtns = Array.from(content.querySelectorAll('.listing-overlay-thumbs .overlay-gallery-thumb'))

    function showImage(index) {
      activeIndex = ((index % images.length) + images.length) % images.length
      mainImg.src = images[activeIndex]
      if (backdropImg) backdropImg.src = images[activeIndex]
      if (counter) counter.textContent = `${activeIndex + 1} / ${images.length}`
      thumbBtns.forEach((btn, i) => btn.classList.toggle('active', i === activeIndex))
    }

    galleryEl?.querySelector('.listing-overlay-nav-btn.prev')?.addEventListener('click', () => showImage(activeIndex - 1))
    galleryEl?.querySelector('.listing-overlay-nav-btn.next')?.addEventListener('click', () => showImage(activeIndex + 1))
    thumbBtns.forEach((btn) => btn.addEventListener('click', () => showImage(Number(btn.dataset.index || 0))))
  }

  listingOverlay.classList.remove('hidden')
  listingOverlay.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
  rememberRecentlyViewed(item.id)
  renderSimilarListings(item)
  mountReviews(content.querySelector('#listing-reviews .reviews-mount'), { kind: 'listing', targetId: item.id, ownerId: item.user_id })
  const sellerReviewMount = content.querySelector('#listing-seller-reviews .reviews-mount')
  if (sellerReviewMount && item.user_id) mountReviews(sellerReviewMount, { kind: 'seller', targetId: item.user_id, ownerId: item.user_id })
  if (opts.focus === 'reviews') setTimeout(() => content.querySelector('#listing-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
}

function closeListingOverlay() {
  listingOverlay.classList.add('hidden')
  listingOverlay.setAttribute('aria-hidden', 'true')
  document.documentElement.classList.remove('lightbox-open')
}

listingOverlay?.addEventListener('click', (event) => {
  if (event.target === listingOverlay) closeListingOverlay()
  if (event.target.closest('[data-close-listing-overlay]')) closeListingOverlay()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !listingOverlay.classList.contains('hidden')) closeListingOverlay()
})

function renderListing(l, container = listingsContainer) {
  if (!(container instanceof Element)) container = listingsContainer
  if (!container) return

  const d = document.createElement('div')
  d.className = 'listing' + (l.sold ? ' listing-sold' : '')
  d.dataset.listingId = l.id
  d.addEventListener('click', (event) => {
    if (event.target.closest('button, a, input, select, textarea')) return
    openListingOverlay(l)
  })
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
    const myRating = myRatingsByListing[String(l.id)]
    parts.push(`<button type="button" class="review-link" data-review-id="${escapeHtml(l.id)}">${myRating ? 'Edit your review' : 'Write a review'}</button>`)
    if (isSiteOwner) {
      parts.push(`<button class="delete-btn admin-delete-btn" data-id="${escapeHtml(l.id)}" type="button">${ICON_SHIELD} Admin: Delete Listing</button>`)
    }
  }

  if (l.user_id && !isOwner) {
    const s = storesById[String(l.user_id)]
    if (s?.name) {
      parts.push(`<button class="visit-store-btn" data-store-id="${escapeHtml(l.user_id)}" type="button">${ICON_STORE} Visit Store: ${escapeHtml(s.name)}${sellerRatingInlineHtml(l.user_id)}</button>`)
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
  const overlayContact = ev.target.closest('[data-overlay-contact-id]')
  if (overlayContact) {
    const item = currentListings.find((r) => String(r.id) === String(overlayContact.dataset.overlayContactId)) || localState.listings.find((r) => String(r.id) === String(overlayContact.dataset.overlayContactId))
    if (item) {
      const link = buildContactLink(item.contact_method, item.contact_details)
      if (link?.url) {
        recordContactTap(item)
        closeListingOverlay()
        window.open(link.url, '_blank', 'noopener,noreferrer')
      } else {
        showUxToast('Seller contact details are not available for this listing.')
      }
    }
    return
  }
  const waLink = ev.target.closest('[data-track-view-id]')
  if (waLink) {
    const item = currentListings.find((r) => String(r.id) === String(waLink.dataset.trackViewId))
    if (item) { trackListingView(item); recordContactTap(item) }
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
  if (!item?.id) return
  rememberRecentlyViewed(item.id)
  renderSimilarListings(item)
  if (!useSupabase) return
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

// ===========================================================================
// Reviews (rating + comment), seller ratings, store design and the seller dashboard.
// Needs linkhub_v24_reviews_dashboard.sql; without it the app keeps working and shows a hint.
// ===========================================================================
const REVIEW_KINDS = {
  listing: { table: 'ratings', key: 'listing_id', label: 'product', placeholder: 'Share what you liked or didn’t like (optional)' },
  seller: { table: 'seller_ratings', key: 'seller_id', label: 'seller', placeholder: 'How was dealing with this seller? (optional)' },
}
const REVIEW_PREVIEW_COUNT = 4
const STORE_ACCENTS = ['#1678e8', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
const STORE_FONTS = [['modern', 'Modern'], ['classic', 'Classic'], ['friendly', 'Friendly']]
const STORE_LAYOUTS = [['grid', 'Grid'], ['list', 'List']]

function ratingAverage(info) { return info && info.count > 0 ? info.sum / info.count : 0 }
function starsHtml(value) {
  const full = Math.max(0, Math.min(5, Math.round(value)))
  return ICON_STAR_FILLED.repeat(full) + ICON_STAR_OUTLINE.repeat(5 - full)
}
function hexToRgba(hex, alpha) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '')
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})` : ''
}
function timeAgo(value) {
  const t = new Date(value).getTime()
  if (!Number.isFinite(t)) return ''
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatMoney(amount, currency) {
  const n = Number(amount) || 0
  const code = String(currency || 'ZAR').toUpperCase()
  const sym = code === 'ZAR' ? 'R' : code === 'USD' ? '$' : `${code} `
  return `${sym}${n.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
}
function getVisitorKey() {
  try {
    let key = localStorage.getItem('linkhub-visitor-key')
    if (!key || key.length < 8) {
      key = (window.crypto?.randomUUID?.() || `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`).slice(0, 60)
      localStorage.setItem('linkhub-visitor-key', key)
    }
    return key
  } catch { return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` }
}
function requestSignIn() {
  try { closeListingOverlay() } catch { /* not open */ }
  try { closeStore() } catch { /* not open */ }
  closeDashboard()
  authSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ---------------------------------------------------------------------------
// Loading ratings + store designs (called after the listings load)
// ---------------------------------------------------------------------------
async function loadRatingsAndDesigns() {
  if (!useSupabase) return
  await Promise.all([loadListingRatingStats(), loadSellerRatingStats(), loadStoreDesigns()])
}

async function loadListingRatingStats() {
  try {
    const { data, error } = await db.from('listing_rating_stats').select('listing_id,rating_count,rating_sum')
    if (error) throw error
    ratingsByListing = {}
    for (const r of data || []) ratingsByListing[String(r.listing_id)] = { sum: Number(r.rating_sum) || 0, count: Number(r.rating_count) || 0 }
  } catch (e) {
    // The summary view is missing (older setup): fall back to reading the ratings themselves.
    try {
      const { data: rows, error } = await db.from('ratings').select('listing_id, rating')
      if (!error) {
        ratingsByListing = {}
        for (const r of rows || []) {
          const key = String(r.listing_id)
          if (!ratingsByListing[key]) ratingsByListing[key] = { sum: 0, count: 0 }
          ratingsByListing[key].sum += Number(r.rating) || 0
          ratingsByListing[key].count += 1
        }
      }
    } catch { /* ratings are optional */ }
  }
  myRatingsByListing = {}
  if (currentUser) {
    try {
      const { data } = await db.from('ratings').select('listing_id, rating').eq('rater_id', currentUser.id)
      for (const r of data || []) myRatingsByListing[String(r.listing_id)] = Number(r.rating)
    } catch { /* ignore */ }
  }
}

async function loadSellerRatingStats() {
  try {
    const { data, error } = await db.from('seller_rating_stats').select('seller_id,rating_count,rating_sum')
    if (error) throw error
    sellerRatingsById = {}
    for (const r of data || []) sellerRatingsById[String(r.seller_id)] = { sum: Number(r.rating_sum) || 0, count: Number(r.rating_count) || 0 }
  } catch { /* seller ratings are optional until the SQL is run */ }
}

async function loadStoreDesigns() {
  try {
    const { data, error } = await db.from('store_designs').select('*')
    if (error) throw error
    storeDesignsById = {}
    for (const row of data || []) storeDesignsById[String(row.owner_id)] = row
  } catch { /* designs are optional until the SQL is run */ }
}

// Small "★ 4.8 (12)" text next to the Visit Store button on listing cards.
function sellerRatingInlineHtml(userId) {
  const info = sellerRatingsById[String(userId)]
  if (!info || !info.count) return ''
  return `<span class="visit-store-rating">${ICON_STAR_FILLED} ${ratingAverage(info).toFixed(1)} <span class="muted">(${info.count})</span></span>`
}

function sellerRatingQuickHtml(userId) {
  const info = sellerRatingsById[String(userId)]
  if (!info || !info.count) return `<span class="seller-review-quick-copy"><strong>Seller rating</strong><span class="muted">No seller ratings yet</span></span>`
  return `<span class="seller-review-quick-copy"><strong>Seller rating</strong><span class="seller-review-stars">${starsHtml(ratingAverage(info))}</span><span class="muted">${ratingAverage(info).toFixed(1)} · ${info.count} review${info.count === 1 ? '' : 's'}</span></span>`
}

function overlayRatingHtml(item) {
  const info = ratingsByListing[String(item.id)]
  const inner = info && info.count
    ? `<span class="listing-rating-stars">${starsHtml(ratingAverage(info))}</span><span class="listing-rating-count">${ratingAverage(info).toFixed(1)} (${info.count} review${info.count === 1 ? '' : 's'})</span>`
    : `<span class="listing-rating-count muted">No reviews yet</span>`
  return `<button type="button" id="listing-overlay-rating" class="listing-rating listing-overlay-rating overlay-rating-link" data-goto-reviews>${inner}</button>`
}


// ---------------------------------------------------------------------------
// Reviews component: used for product reviews (listing overlay) and seller reviews (store page)
// ---------------------------------------------------------------------------
function reviewFriendlyError(e) {
  const m = String(e?.message || '')
  if (/does not exist|schema cache|column|relation|permission denied|violates row-level/i.test(m) && !/own listing/i.test(m)) {
    return 'Reviews are not switched on yet. Run the latest LinkHub SQL in Supabase, then try again.'
  }
  return m || 'Could not save your review. Try again.'
}

async function fetchReviews(kind, targetId) {
  const cfg = REVIEW_KINDS[kind]
  const cols = kind === 'seller'
    ? 'rater_id,rating,comment,rater_name,verified_contact,created_at,updated_at'
    : 'rater_id,rating,comment,rater_name,created_at,updated_at'
  const { data, error } = await db.from(cfg.table).select(cols).eq(cfg.key, targetId).order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return data || []
}

function reviewIsMine(row) { return !!currentUser && String(row.rater_id) === String(currentUser.id) }

function reviewsHtml(state) {
  const { kind, rows } = state
  const cfg = REVIEW_KINDS[kind]
  const count = rows.length
  const sum = rows.reduce((a, r) => a + Number(r.rating || 0), 0)
  const avg = count ? sum / count : 0
  const dist = [5, 4, 3, 2, 1].map((n) => rows.filter((r) => Number(r.rating) === n).length)
  const mine = rows.find(reviewIsMine)
  const isOwner = !!currentUser && String(currentUser.id) === String(state.ownerId)

  const summary = count
    ? `<div class="reviews-summary">
        <div class="reviews-score"><strong>${avg.toFixed(1)}</strong><div class="reviews-stars">${starsHtml(avg)}</div><span class="muted">${count} review${count === 1 ? '' : 's'}</span></div>
        <div class="reviews-bars">${dist.map((n, i) => `<div class="reviews-bar-row"><span>${5 - i}</span><div class="reviews-bar"><i style="width:${Math.round((n / count) * 100)}%"></i></div><span class="muted">${n}</span></div>`).join('')}</div>
      </div>`
    : `<p class="reviews-empty muted">No reviews yet${isOwner ? '.' : `. Be the first to review this ${cfg.label}.`}</p>`

  let form
  if (!currentUser) {
    form = `<div class="reviews-signin"><span>Sign in to review this ${cfg.label}.</span><button type="button" class="reviews-signin-btn">Sign in</button></div>`
  } else if (isOwner) {
    form = `<p class="reviews-note muted">You can’t review your own ${kind === 'seller' ? 'seller profile' : 'listing'}.</p>`
  } else {
    const d = state.draftRating || 0
    form = `<form class="reviews-form" novalidate>
      <div class="reviews-form-title">${mine ? 'Your review' : 'Write a review'}</div>
      <div class="reviews-rating-hint muted">${d ? `You selected ${d} star${d === 1 ? '' : 's'}` : 'Choose a rating'}</div>
      <div class="review-star-input" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="review-star${d >= n ? ' active' : ''}" data-value="${n}" role="radio" aria-checked="${d === n}" aria-label="${n} star${n === 1 ? '' : 's'}">${d >= n ? ICON_STAR_FILLED : ICON_STAR_OUTLINE}</button>`).join('')}</div>
      <textarea class="reviews-text" maxlength="500" rows="3" placeholder="${escapeHtml(cfg.placeholder)}" aria-label="Your comment">${escapeHtml(state.draftComment || '')}</textarea>
      <div class="reviews-form-row">
        <span class="reviews-count muted">${(state.draftComment || '').length}/500</span>
        <span class="reviews-msg" role="status"></span>
        ${mine ? '<button type="button" class="reviews-delete">Delete</button>' : ''}
        <button type="submit" class="reviews-submit">${mine ? 'Update review' : 'Post review'}</button>
      </div>
    </form>`
  }

  const ordered = [...rows.filter(reviewIsMine), ...rows.filter((r) => !reviewIsMine(r))]
  const shown = state.showAll ? ordered : ordered.slice(0, REVIEW_PREVIEW_COUNT)
  const list = shown.length
    ? `<ul class="reviews-list">${shown.map((r) => {
        const name = r.rater_name || 'LinkHub user'
        const edited = r.updated_at && r.created_at && new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 60000 ? ' · edited' : ''
        return `<li class="review-item">
          <span class="review-avatar" style="background:hsl(${avatarHueFromSeed(r.rater_id)} 55% 38%)" aria-hidden="true">${escapeHtml(initialsFromName(name))}</span>
          <div class="review-body">
            <div class="review-top"><strong>${escapeHtml(name)}</strong>${reviewIsMine(r) ? '<span class="review-badge review-badge-you">You</span>' : ''}${r.verified_contact ? '<span class="review-badge">Chatted on LinkHub</span>' : ''}<span class="review-date muted">${escapeHtml(timeAgo(r.created_at))}${edited}</span></div>
            <div class="review-stars">${starsHtml(Number(r.rating))}</div>
            ${r.comment ? `<p class="review-text">${escapeHtml(r.comment)}</p>` : ''}
          </div>
        </li>`
      }).join('')}</ul>${!state.showAll && ordered.length > REVIEW_PREVIEW_COUNT ? `<button type="button" class="reviews-more">Show all ${ordered.length} reviews</button>` : ''}`
    : ''

  return `${summary}${form}${list}`
}

async function saveReview(kind, targetId, rating, comment) {
  const cfg = REVIEW_KINDS[kind]
  const row = { [cfg.key]: targetId, rater_id: currentUser.id, rating, comment: comment || null }
  const { error } = await db.from(cfg.table).upsert(row, { onConflict: `${cfg.key},rater_id` })
  if (error) throw error
}

async function deleteReview(kind, targetId) {
  const cfg = REVIEW_KINDS[kind]
  const { error } = await db.from(cfg.table).delete().eq(cfg.key, targetId).eq('rater_id', currentUser.id)
  if (error) throw error
}

// Keep the numbers on cards, the overlay and the store header in step with what was just saved.
function applyReviewCache(kind, targetId, rows) {
  const key = String(targetId)
  const info = { sum: rows.reduce((a, r) => a + Number(r.rating || 0), 0), count: rows.length }
  if (kind === 'listing') {
    ratingsByListing[key] = info
    const mine = rows.find(reviewIsMine)
    if (mine) myRatingsByListing[key] = Number(mine.rating)
    else delete myRatingsByListing[key]
    const chip = document.getElementById('listing-overlay-rating')
    if (chip && chip.closest('.listing-overlay-body')?.querySelector('#listing-reviews')?.dataset.itemId === key) chip.outerHTML = overlayRatingHtml({ id: key })
  } else {
    sellerRatingsById[key] = info
    renderStoreRatingChip(key)
  }
  try { renderFilteredListings() } catch { /* not ready */ }
  if (activeStoreUserId) { try { renderStoreListings() } catch { /* not ready */ } }
}

async function mountReviews(container, opts) {
  if (!container) return
  const token = {}
  container._reviewsToken = token
  if (!useSupabase) { container.innerHTML = ''; return }
  container.innerHTML = '<div class="reviews-loading muted">Loading reviews…</div>'
  const state = { ...opts, rows: [], showAll: false, draftRating: 0, draftComment: '' }
  try {
    state.rows = await fetchReviews(opts.kind, opts.targetId)
  } catch (e) {
    if (container._reviewsToken === token) container.innerHTML = `<p class="reviews-empty muted">${escapeHtml(reviewFriendlyError(e))}</p>`
    return
  }
  if (container._reviewsToken !== token) return
  const mine = state.rows.find(reviewIsMine)
  state.draftRating = mine ? Number(mine.rating) : 0
  state.draftComment = mine?.comment || ''
  const render = () => {
    if (container._reviewsToken !== token) return
    container.innerHTML = reviewsHtml(state)
    wireReviews(container, state, render, token)
  }
  render()
}

function wireReviews(container, state, render, token) {
  const say = (text, bad) => {
    const el = container.querySelector('.reviews-msg')
    if (!el) return
    el.textContent = text
    el.classList.toggle('is-error', !!bad)
  }
  const textarea = container.querySelector('.reviews-text')
  textarea?.addEventListener('input', () => {
    state.draftComment = textarea.value
    const counter = container.querySelector('.reviews-count')
    if (counter) counter.textContent = `${textarea.value.length}/500`
  })
  container.querySelectorAll('.review-star').forEach((btn) => btn.addEventListener('click', () => {
    state.draftRating = Number(btn.dataset.value)
    container.querySelectorAll('.review-star').forEach((s) => {
      const on = Number(s.dataset.value) <= state.draftRating
      s.classList.toggle('active', on)
      s.setAttribute('aria-checked', String(Number(s.dataset.value) === state.draftRating))
      s.innerHTML = on ? ICON_STAR_FILLED : ICON_STAR_OUTLINE
    })
    say('')
  }))
  container.querySelector('.reviews-signin-btn')?.addEventListener('click', requestSignIn)
  container.querySelector('.reviews-more')?.addEventListener('click', () => { state.showAll = true; render() })

  const refresh = async () => {
    state.rows = await fetchReviews(state.kind, state.targetId)
    if (container._reviewsToken !== token) return false
    applyReviewCache(state.kind, state.targetId, state.rows)
    return true
  }

  container.querySelector('.reviews-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!state.draftRating) { say('Tap a star to choose your rating first.', true); return }
    const submit = container.querySelector('.reviews-submit')
    if (submit) submit.disabled = true
    say('Saving…')
    try {
      await saveReview(state.kind, state.targetId, state.draftRating, (state.draftComment || '').trim())
      if (!(await refresh())) return
      showUxToast('Thanks, your review is posted.')
      render()
    } catch (e) {
      if (submit) submit.disabled = false
      say(reviewFriendlyError(e), true)
    }
  })

  container.querySelector('.reviews-delete')?.addEventListener('click', async () => {
    if (!confirm('Delete your review?')) return
    try {
      await deleteReview(state.kind, state.targetId)
      state.draftRating = 0
      state.draftComment = ''
      if (!(await refresh())) return
      render()
    } catch (e) {
      say(reviewFriendlyError(e), true)
    }
  })
}

// Card + overlay hooks (delegated, so they work for every listing card)
document.body.addEventListener('click', (event) => {
  const reviewBtn = event.target.closest('[data-review-id]')
  if (reviewBtn) {
    const item = currentListings.find((r) => String(r.id) === String(reviewBtn.dataset.reviewId))
    if (item) openListingOverlay(item, { focus: 'reviews' })
    return
  }
  if (event.target.closest('[data-goto-seller-reviews]')) {
    event.preventDefault()
    document.getElementById('listing-seller-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  if (event.target.closest('[data-goto-reviews]')) {
    document.getElementById('listing-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
})

// ---------------------------------------------------------------------------
// Store page: rating chip, design, announcement, visits
// ---------------------------------------------------------------------------
function renderStoreRatingChip(userId) {
  const chip = document.getElementById('store-rating-chip')
  if (!chip || String(activeStoreUserId) !== String(userId)) return
  const info = sellerRatingsById[String(userId)]
  if (info && info.count) {
    chip.innerHTML = `${ICON_STAR_FILLED} <strong>${ratingAverage(info).toFixed(1)}</strong> <span>${info.count} rating${info.count === 1 ? '' : 's'}</span>`
  } else {
    chip.innerHTML = `${ICON_STAR_OUTLINE} <span>No ratings yet</span>`
  }
  chip.classList.remove('hidden')
}

function applyStoreDesign(userId) {
  const panel = storeOverlay?.querySelector('.app-overlay-panel')
  if (!panel) return
  const d = storeDesignsById[String(userId)]
  const accent = /^#[0-9a-f]{6}$/i.test(d?.accent || '') ? d.accent : ''
  if (accent) {
    panel.style.setProperty('--store-accent', accent)
    panel.style.setProperty('--store-accent-soft', hexToRgba(accent, 0.16))
    panel.dataset.storeThemed = '1'
  } else {
    panel.style.removeProperty('--store-accent')
    panel.style.removeProperty('--store-accent-soft')
    delete panel.dataset.storeThemed
  }
  panel.dataset.storeFont = d?.font || 'modern'
  const note = document.getElementById('store-announcement')
  if (note) {
    note.textContent = d?.announcement || ''
    note.classList.toggle('hidden', !d?.announcement)
  }
  storeGrid?.classList.toggle('store-layout-list', d?.layout === 'list')
}

function recordStoreVisit(storeId) {
  if (!useSupabase || !storeId) return
  if (currentUser && String(currentUser.id) === String(storeId)) return
  const day = new Date().toISOString().slice(0, 10)
  const marker = `linkhub-store-visit-${storeId}-${day}`
  try { if (localStorage.getItem(marker)) return; localStorage.setItem(marker, '1') } catch { /* private mode */ }
  Promise.resolve(db.rpc('record_store_visit', { p_store: storeId, p_visitor_key: getVisitorKey() })).catch(() => {})
}

function recordContactTap(item) {
  if (!useSupabase || !item?.id) return
  if (currentUser && item.user_id && String(currentUser.id) === String(item.user_id)) return
  Promise.resolve(db.rpc('record_contact_tap', { p_listing: item.id, p_visitor_key: getVisitorKey() })).catch(() => {})
}

// ---------------------------------------------------------------------------
// Store editor: "Design your store"
// ---------------------------------------------------------------------------
const designState = { accent: STORE_ACCENTS[0], font: 'modern', layout: 'grid', featured: [] }

function renderDesignControls() {
  const accents = document.getElementById('store-design-accents')
  if (!accents) return
  accents.innerHTML = STORE_ACCENTS.map((c) => `<button type="button" class="store-swatch${designState.accent.toLowerCase() === c ? ' active' : ''}" data-color="${c}" style="background:${c}" aria-label="Accent ${c}"></button>`).join('')
  const custom = document.getElementById('store-design-accent-custom')
  if (custom) custom.value = designState.accent
  const choice = (id, list, current, attr) => {
    const el = document.getElementById(id)
    if (el) el.innerHTML = list.map(([value, label]) => `<button type="button" class="store-choice-btn${current === value ? ' active' : ''}" data-${attr}="${value}" aria-pressed="${current === value}">${label}</button>`).join('')
  }
  choice('store-design-fonts', STORE_FONTS, designState.font, 'font')
  choice('store-design-layouts', STORE_LAYOUTS, designState.layout, 'layout')
  const feat = document.getElementById('store-design-featured')
  if (feat) {
    const mine = currentUser ? currentListings.filter((l) => String(l.user_id) === String(currentUser.id) && !l.sold) : []
    const full = designState.featured.length >= 3
    feat.innerHTML = mine.length
      ? mine.map((l) => {
          const on = designState.featured.includes(String(l.id))
          return `<label class="store-featured-item"><input type="checkbox" value="${escapeHtml(l.id)}"${on ? ' checked' : ''}${full && !on ? ' disabled' : ''}><span>${escapeHtml(l.title || 'Untitled')}</span></label>`
        }).join('')
      : '<p class="muted store-design-empty">Post a listing first, then you can feature it at the top of your store.</p>'
  }
  renderDesignPreview()
}

function renderDesignPreview() {
  const box = document.getElementById('store-design-preview')
  if (!box) return
  const name = (storeManageName?.value || '').trim() || 'Your store name'
  const note = (document.getElementById('store-design-announcement')?.value || '').trim()
  box.dataset.storeFont = designState.font
  box.style.setProperty('--store-accent', designState.accent)
  box.style.setProperty('--store-accent-soft', hexToRgba(designState.accent, 0.16))
  box.innerHTML = `<div class="store-preview-banner"></div>
    <div class="store-preview-head"><span class="store-preview-logo">${escapeHtml(initialsFromName(name))}</span><div><strong>${escapeHtml(name)}</strong><small>Preview of your store page</small></div><span class="store-preview-btn">Contact</span></div>
    ${note ? `<div class="store-preview-note">${escapeHtml(note)}</div>` : ''}
    <div class="store-preview-grid ${designState.layout === 'list' ? 'is-list' : ''}"><i></i><i></i><i></i><i></i></div>`
}

function populateStoreDesignForm() {
  const d = currentUser ? storeDesignsById[String(currentUser.id)] : null
  designState.accent = /^#[0-9a-f]{6}$/i.test(d?.accent || '') ? d.accent.toLowerCase() : STORE_ACCENTS[0]
  designState.font = d?.font || 'modern'
  designState.layout = d?.layout || 'grid'
  designState.featured = (d?.featured_ids || []).map(String)
  const note = document.getElementById('store-design-announcement')
  if (note) note.value = d?.announcement || ''
  renderDesignControls()
}

document.getElementById('store-design')?.addEventListener('click', (event) => {
  const swatch = event.target.closest('.store-swatch')
  const font = event.target.closest('[data-font]')
  const layout = event.target.closest('[data-layout]')
  if (swatch) designState.accent = swatch.dataset.color
  else if (font) designState.font = font.dataset.font
  else if (layout) designState.layout = layout.dataset.layout
  else return
  renderDesignControls()
})
document.getElementById('store-design-accent-custom')?.addEventListener('input', (event) => { designState.accent = event.target.value; renderDesignControls() })
document.getElementById('store-design-featured')?.addEventListener('change', (event) => {
  const box = event.target.closest('input[type="checkbox"]')
  if (!box) return
  const id = String(box.value)
  designState.featured = box.checked ? [...new Set([...designState.featured, id])].slice(0, 3) : designState.featured.filter((x) => x !== id)
  renderDesignControls()
})
document.getElementById('store-design-announcement')?.addEventListener('input', renderDesignPreview)
storeManageName?.addEventListener('input', renderDesignPreview)
document.querySelectorAll('.store-design-preset').forEach(btn=>btn.addEventListener('click',()=>{const p=btn.dataset.storePreset;if(p==='bold'){designState.accent='#1678e8';designState.font='friendly';designState.layout='grid'}else if(p==='classic'){designState.accent='#c9a25d';designState.font='classic';designState.layout='list'}else{designState.accent='#1678e8';designState.font='modern';designState.layout='grid'}renderDesignControls();document.querySelectorAll('.store-design-preset').forEach(el=>el.classList.toggle('active',el===btn));saveStoreDraft()}))

// Returns '' when saved, or a short message to show under the form.
async function saveStoreDesign() {
  if (!useSupabase || !currentUser) return ''
  const announcement = (document.getElementById('store-design-announcement')?.value || '').trim().slice(0, 140)
  const row = {
    owner_id: currentUser.id,
    accent: designState.accent.toLowerCase(),
    font: designState.font,
    layout: designState.layout,
    announcement: announcement || null,
    featured_ids: designState.featured.slice(0, 3),
    updated_at: new Date().toISOString(),
  }
  const { error } = await db.from('store_designs').upsert(row, { onConflict: 'owner_id' })
  if (error) return /does not exist|schema cache|permission denied/i.test(error.message || '') ? ' Your store design was not saved because the latest LinkHub SQL has not been run yet.' : ` Your store design was not saved: ${error.message}`
  storeDesignsById[String(currentUser.id)] = row
  return ''
}

// ---------------------------------------------------------------------------
// Seller dashboard
// ---------------------------------------------------------------------------
const dashboardOverlay = document.getElementById('dashboard-overlay')
const dashboardBody = document.getElementById('dashboard-body')
let dashboardDays = 30
let dashboardRequest = 0

function dashboardIcon() {
  return '<svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
}

function openDashboard() {
  if (!currentUser) { requestSignIn(); return }
  if (!dashboardOverlay) return
  dashboardOverlay.classList.remove('hidden')
  dashboardOverlay.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
  loadDashboard(dashboardDays)
}

function closeDashboard() {
  if (!dashboardOverlay || dashboardOverlay.classList.contains('hidden')) return
  dashboardOverlay.classList.add('hidden')
  dashboardOverlay.setAttribute('aria-hidden', 'true')
  document.documentElement.classList.remove('lightbox-open')
}

async function loadDashboard(days) {
  if (!dashboardBody) return
  dashboardDays = days
  const request = ++dashboardRequest
  dashboardBody.innerHTML = '<div class="dash-loading-state"><span class="dash-loading-spinner" aria-hidden="true"></span><strong>Loading your dashboard…</strong><span class="muted">Pulling your latest store activity.</span></div>'
  if (!useSupabase) {
    dashboardBody.innerHTML = '<div class="dash-system-note is-warning"><strong>Supabase is not connected.</strong><span>Connect LinkHub to see live store analytics.</span></div>'
    return
  }
  try {
    const { data, error } = await db.rpc('store_dashboard', { p_days: days })
    if (error) throw error
    if (request !== dashboardRequest) return
    dashboardBody.innerHTML = dashboardHtml(data || {})
    wireDashboard()
  } catch (e) {
    if (request !== dashboardRequest) return
    // Do not leave the dashboard looking empty when the RPC is unavailable.
    // Fall back to data the signed-in seller can already read, while clearly
    // identifying which analytics need the dashboard SQL function.
    try {
      const fallback = await buildDashboardFallback(days)
      if (request !== dashboardRequest) return
      dashboardBody.innerHTML = dashboardHtml(fallback, {
        warning: /does not exist|schema cache|Could not find/i.test(e?.message || '')
          ? 'Some live analytics are unavailable because the store dashboard SQL function is not active yet.'
          : 'Live analytics could not be loaded, so the dashboard is showing the information available to your account.'
      })
      wireDashboard()
    } catch (fallbackError) {
      if (request !== dashboardRequest) return
      dashboardBody.innerHTML = `<div class="dash-system-note is-warning"><strong>Dashboard data could not be loaded.</strong><span>${escapeHtml(fallbackError?.message || e?.message || 'Please try again.')}</span><button type="button" class="dash-retry-btn">Try again</button></div>`
      dashboardBody.querySelector('.dash-retry-btn')?.addEventListener('click', () => loadDashboard(dashboardDays))
    }
  }
}

async function buildDashboardFallback(days) {
  if (!currentUser) throw new Error('Sign in to view your dashboard.')
  const [listingsRes, sellerRes] = await Promise.all([
    db.from('listings').select('*').eq('user_id', currentUser.id),
    db.from('seller_ratings').select('rating').eq('seller_id', currentUser.id)
  ])
  if (listingsRes.error) throw listingsRes.error
  if (sellerRes.error) throw sellerRes.error
  const listings = listingsRes.data || []
  let productRatings = []
  // Query product ratings only when there are listings.
  if (listings.length) {
    const ids = listings.map(x => x.id).filter(Boolean)
    const r = await db.from('ratings').select('rating,listing_id').in('listing_id', ids)
    if (!r.error) productRatings = r.data || []
  }
  const viewsOf = (x) => Number(x?.views ?? x?.view_count ?? 0) || 0
  const activeListings = listings.filter(x => !Boolean(x?.sold))
  const totalViews = activeListings.reduce((sum, x) => sum + viewsOf(x), 0)
  const top = activeListings.map(x => ({ id: x.id, title: x.title, views: viewsOf(x) })).sort((a,b) => b.views-a.views).slice(0,5)
  const sellerRatings = (sellerRes.data || []).map(x => Number(x.rating)).filter(Number.isFinite)
  const productRatingValues = productRatings.map(x => Number(x.rating)).filter(Number.isFinite)
  const sellerAvg = sellerRatings.length ? sellerRatings.reduce((a,b)=>a+b,0) / sellerRatings.length : null
  const productAvg = productRatingValues.length ? productRatingValues.reduce((a,b)=>a+b,0) / productRatingValues.length : null
  return {
    days,
    visits: { total: 0, unique: 0, series: [] },
    listing_views: { total: totalViews, top },
    active_listings: activeListings.length,
    interest: { contact_taps: 0, chats: 0, offers: 0 },
    sales: { count: listings.filter(x => Boolean(x?.sold)).length, totals: [], recent: [] },
    ratings: { seller_avg: sellerAvg, seller_count: sellerRatings.length, product_avg: productAvg, product_count: productRatingValues.length }
  }
}

function dashSvgIcon(kind){const p={eye:'M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Zm9.5-2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',users:'M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20m6-10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6.5 2.5a3.2 3.2 0 0 1 3 3.2V20',message:'M4 5.5h16v10H8l-4 3v-13Z',phone:'M7 3.8 9.7 3l2 4-1.8 1.6a14.5 14.5 0 0 0 5.5 5.5L17 12.3l4 2 0.8 2.7c.2.7-.1 1.4-.8 1.7l-1.8.8C12.9 17.4 6.6 11.1 4.5 4.8l.8-1.8c.3-.7 1-.9 1.7-.7Z',bag:'M5 8h14l1 12H4L5 8Zm3 0a4 4 0 0 1 8 0',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z',store:'M4 9.5h16M6 9.5V20m12-10.5V20M3 20h18M5 9.5 7 4h10l2 5.5M7 14h10'};return `<svg class="dash-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${p[kind]||p.store}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`}
function visitsChartSvg(series){const pts=Array.isArray(series)?series:[],v=pts.map(p=>Math.max(0,Number(p.visitors)||0));if(!v.length||!v.some(Boolean))return'';const W=1000,H=260,px=26,pt=24,pb=34,pw=W-px*2,ph=H-pt-pb,max=Math.max(1,...v),x=i=>px+(pts.length===1?pw/2:i/(pts.length-1)*pw),y=n=>pt+ph-n/max*ph,line=pts.map((p,i)=>`${x(i).toFixed(1)},${y(v[i]).toFixed(1)}`).join(' '),area=`${px},${pt+ph} ${line} ${px+pw},${pt+ph}`,grid=[0,.25,.5,.75,1].map(r=>{const yy=pt+ph-r*ph;return`<line x1="${px}" y1="${yy}" x2="${px+pw}" y2="${yy}" class="dash-grid-line"/>`}).join(''),points=pts.map((p,i)=>{if(!v[i])return'';const d=new Date(`${p.day}T00:00:00`),l=d.toLocaleDateString([],{day:'numeric',month:'short'});return`<g><title>${escapeHtml(d.toLocaleDateString([],{weekday:'long',day:'numeric',month:'long'}))}: ${v[i]} visitor${v[i]===1?'':'s'}</title><circle cx="${x(i).toFixed(1)}" cy="${y(v[i]).toFixed(1)}" r="3.5" class="dash-point"/><text x="${x(i).toFixed(1)}" y="${H-10}" class="dash-axis-label">${escapeHtml(l)}</text></g>`}).join('');return`<div class="dash-chart-wrap"><svg class="dash-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Store visitors trend"><defs><linearGradient id="dashAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1678e8" stop-opacity=".28"/><stop offset="100%" stop-color="#1678e8" stop-opacity="0"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#dashAreaGradient)"/><polyline points="${line}" class="dash-line"/>${points}</svg></div>`}
function dashCompletionHtml(store){const f=[['Store name',!!store?.name],['Category',!!store?.category],['Phone',!!store?.phone],['Location',!!store?.location],['About',!!store?.bio],['Logo',!!store?.logo_url],['Banner',!!store?.banner_url],['Store design',!!storeDesignsById[String(currentUser?.id)]]],done=f.filter(x=>x[1]).length,pct=Math.round(done/f.length*100),missing=f.filter(x=>!x[1]).map(x=>x[0]);return`<section class="dash-card"><div class="dash-card-head"><div><span class="dash-eyebrow">Store setup</span><h3>Store profile</h3></div><strong class="dash-completion-pct">${pct}%</strong></div><div class="dash-progress"><i style="width:${pct}%"></i></div><p class="muted dash-completion-copy">${pct===100?'Your storefront is fully filled in.':`Add ${missing.slice(0,2).join(' and ')}${missing.length>2?` + ${missing.length-2} more`:''} to give customers more information.`}</p></section>`}
function dashFunnelHtml(vis,interest){const s=[['Store visitors',Number(vis.unique||0),'users'],['Contact taps',Number(interest.contact_taps||0),'phone'],['New chats',Number(interest.chats||0),'message'],['Offers',Number(interest.offers||0),'bag']],base=Math.max(1,...s.map(x=>x[1])),vc=s[0][1];return`<section class="dash-card"><div class="dash-card-head"><div><span class="dash-eyebrow">Engagement</span><h3>Customer activity</h3></div><span class="dash-card-meta">${dashboardDays} days</span></div><div class="dash-funnel">${s.map(([label,val,icon])=>{const pct=vc?Math.round(val/vc*100):0;return`<div class="dash-funnel-row"><div class="dash-funnel-label"><span class="dash-funnel-icon">${dashSvgIcon(icon)}</span><span>${label}</span><strong>${val.toLocaleString()}</strong></div><div class="dash-funnel-track"><i style="width:${Math.max(val?4:0,Math.round(val/base*100))}%"></i></div><small class="muted">${label==='Store visitors'?'starting point':`${pct}% of visitors`}</small></div>`}).join('')}</div></section>`}
function dashRatingsHtml(r){const sc=Number(r.seller_count||0),sa=sc?Number(r.seller_avg||0):0,pc=Number(r.product_count||0),pa=pc?Number(r.product_avg||0):0,stars=a=>a?`${'★'.repeat(Math.round(a))}${'☆'.repeat(Math.max(0,5-Math.round(a)))}`:'☆☆☆☆☆';return`<section class="dash-card"><div class="dash-card-head"><div><span class="dash-eyebrow">Trust</span><h3>Ratings</h3></div><span class="dash-card-meta">All time</span></div><div class="dash-rating-grid"><div class="dash-rating-big"><strong>${sc?sa.toFixed(1):'—'}</strong><span class="dash-stars">${stars(sa)}</span><small class="muted">Seller rating · ${sc} review${sc===1?'':'s'}</small></div><div class="dash-rating-big"><strong>${pc?pa.toFixed(1):'—'}</strong><span class="dash-stars">${stars(pa)}</span><small class="muted">Product rating · ${pc} review${pc===1?'':'s'}</small></div></div></section>`}
function dashSalesHtml(s){const t=Array.isArray(s.totals)?s.totals:[],r=Array.isArray(s.recent)?s.recent:[],m=Math.max(1,...t.map(x=>Number(x.amount)||0));return`<section class="dash-card"><div class="dash-card-head"><div><span class="dash-eyebrow">Sales</span><h3>Sales performance</h3></div><span class="dash-card-meta">${Number(s.count||0).toLocaleString()} sold</span></div>${t.length?`<div class="dash-sales-total-row">${t.map(x=>`<div><strong>${escapeHtml(formatMoney(x.amount,x.currency))}</strong><span class="muted">${escapeHtml(x.currency||'ZAR')} revenue</span></div>`).join('')}</div><div class="dash-sales-bars">${t.map(x=>`<div class="dash-sales-bar-row"><span>${escapeHtml(x.currency||'ZAR')}</span><div class="dash-top-bar"><i style="width:${Math.max(4,Math.round((Number(x.amount)/m)*100))}%"></i></div><strong>${escapeHtml(formatMoney(x.amount,x.currency))}</strong></div>`).join('')}</div>`:'<p class="muted">Mark a listing as sold and your sales history will appear here.</p>'}${r.length?`<div class="dash-sales-subhead">Recent sales</div><ul class="dash-sales">${r.map(x=>`<li><span>${escapeHtml(x.title||'Item')}</span><span class="muted">${escapeHtml(timeAgo(x.sold_at))}</span><strong>${x.price!=null?escapeHtml(formatMoney(x.price,x.currency)):'—'}</strong></li>`).join('')}</ul>`:''}</section>`}
function dashboardHtml(d, options={}){const vis=d.visits||{},interest=d.interest||{},sales=d.sales||{},ratings=d.ratings||{},days=d.days||dashboardDays,store=getStoreForUser(currentUser?.id),top=(d.listing_views?.top||[]).filter(x=>Number(x.views)>=0),topMax=Math.max(1,...top.map(x=>Number(x.views)||0)),vc=Number(vis.unique||0),cc=Number(interest.contact_taps||0),ch=Number(interest.chats||0),of=Number(interest.offers||0),sold=Number(sales.count||0),active=Number(d.active_listings||0),lv=Number(d.listing_views?.total||0),avg=active?Math.round(lv/active):0,rate=vc?Math.round(cc/vc*100):0,has=vc||cc||ch||of||sold,sc=Number(ratings.seller_count||0),sr=sc?`${Number(ratings.seller_avg||0).toFixed(1)} ★`:'—',title=store?.name||'Your LinkHub store',range=[7,30,90].map(n=>`<button type="button" class="dash-range-btn${n===days?' active':''}" data-days="${n}">${n} days</button>`).join('');return`${options.warning?`<div class="dash-system-note is-info"><span class="dash-system-note-icon">!</span><div><strong>Analytics status</strong><span>${escapeHtml(options.warning)}</span></div><button type="button" class="dash-retry-btn">Retry</button></div>`:''}<div class="dash-hero"><div class="dash-hero-main"><span class="dash-live-dot"></span><div><span class="dash-eyebrow">${escapeHtml(title)}</span><strong>Store performance</strong><span class="muted">A live view of visitors, products, customer interest, sales and trust.</span></div></div><div class="dash-range" role="group" aria-label="Time range">${range}</div></div><div class="dash-kpis"><div class="dash-kpi"><span class="dash-kpi-icon">${dashSvgIcon('users')}</span><span class="dash-kpi-label">Visitors</span><strong class="dash-kpi-value">${vc.toLocaleString()}</strong><span class="dash-kpi-sub">unique store visitors · ${days} days</span></div><div class="dash-kpi"><span class="dash-kpi-icon">${dashSvgIcon('eye')}</span><span class="dash-kpi-label">Listing views</span><strong class="dash-kpi-value">${lv.toLocaleString()}</strong><span class="dash-kpi-sub">${active} active listing${active===1?'':'s'} · ${avg} avg each</span></div><div class="dash-kpi"><span class="dash-kpi-icon">${dashSvgIcon('phone')}</span><span class="dash-kpi-label">Contact taps</span><strong class="dash-kpi-value">${cc.toLocaleString()}</strong><span class="dash-kpi-sub">${rate}% of visitors reached out</span></div><div class="dash-kpi"><span class="dash-kpi-icon">${dashSvgIcon('message')}</span><span class="dash-kpi-label">Chats</span><strong class="dash-kpi-value">${ch.toLocaleString()}</strong><span class="dash-kpi-sub">${of} offer${of===1?'':'s'} received</span></div><div class="dash-kpi"><span class="dash-kpi-icon">${dashSvgIcon('bag')}</span><span class="dash-kpi-label">Sold</span><strong class="dash-kpi-value">${sold.toLocaleString()}</strong><span class="dash-kpi-sub">items marked sold · ${days} days</span></div><div class="dash-kpi"><span class="dash-kpi-icon">${dashSvgIcon('star')}</span><span class="dash-kpi-label">Seller rating</span><strong class="dash-kpi-value">${sr}</strong><span class="dash-kpi-sub">${sc} seller review${sc===1?'':'s'}</span></div></div>${!has?`<div class="dash-empty dash-empty-rich"><div class="dash-empty-icon">${dashSvgIcon('store')}</div><div><strong>Your dashboard is ready.</strong><span class="muted">Share your store link and start listing products. The cards below will fill up as people interact with your store.</span></div><button type="button" class="dash-share-btn">Share my store</button></div>`:''}<div class="dash-grid dash-grid-two"><section class="dash-card dash-chart-card"><div class="dash-card-head"><div><span class="dash-eyebrow">Reach</span><h3>Store visitors</h3></div><span class="dash-card-meta">${days} days</span></div>${visitsChartSvg(vis.series)||'<div class="dash-no-chart"><strong>No visitor activity yet</strong><span class="muted">When people open your store, their activity will appear here.</span></div>'}</section>${dashFunnelHtml(vis,interest)}</div><div class="dash-grid dash-grid-two">${dashCompletionHtml(store)}${dashRatingsHtml(ratings)}</div><div class="dash-grid dash-grid-two"><section class="dash-card"><div class="dash-card-head"><div><span class="dash-eyebrow">Listings</span><h3>Most viewed products</h3></div><span class="dash-card-meta">all time</span></div>${top.length?`<ul class="dash-top">${top.map((x,i)=>`<li><span class="dash-top-rank">${i+1}</span><span class="dash-top-title">${escapeHtml(x.title||'Untitled')}</span><span class="dash-top-bar"><i style="width:${Number(x.views)>0?Math.max(4,Math.round(Number(x.views)/topMax*100)):0}%"></i></span><span class="dash-top-count">${Number(x.views).toLocaleString()}</span></li>`).join('')}</ul>`:'<p class="muted">Your product views will appear here.</p>'}</section>${dashSalesHtml(sales)}</div>`}
function wireDashboard(){dashboardBody?.querySelectorAll('.dash-range-btn').forEach(btn=>btn.addEventListener('click',()=>loadDashboard(Number(btn.dataset.days))));dashboardBody?.querySelector('.dash-share-btn')?.addEventListener('click',shareMyStoreLink)}

async function shareMyStoreLink() {
  if (!currentUser) return
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('store', currentUser.id)
  const name = getStoreForUser(currentUser.id)?.name || 'My LinkHub store'
  try {
    if (navigator.share) { await navigator.share({ title: name, text: `${name} on LinkHub`, url: url.toString() }); return }
  } catch { /* cancelled */ }
  try { await navigator.clipboard.writeText(url.toString()); showUxToast('Store link copied.') } catch { showUxToast(url.toString()) }
}

document.getElementById('dashboard-close')?.addEventListener('click', closeDashboard)
dashboardOverlay?.addEventListener('click', (event) => { if (event.target === dashboardOverlay) closeDashboard() })
document.getElementById('store-dashboard-btn')?.addEventListener('click', () => openDashboard())

// Retry control for the dashboard status banner.
dashboardBody?.addEventListener('click', (event) => {
  if (event.target.closest('.dash-retry-btn')) loadDashboard(dashboardDays)
})

// ===========================================================================
// Windows (overlays): the newest one is always on top, closing one goes back to the one underneath,
// the page scroll position is restored, and the phone/browser Back button closes windows instead of
// taking people out of LinkHub.
// (var on purpose: this can be reached before the block below has run once)
// ===========================================================================
const LH_OVERLAY_SELECTOR = '.app-overlay, .lightbox-overlay, #nav-drawer, #carty-panel'
var lhOverlayStack = []
var lhOverlayWatched = null
var lhSavedScrollY = 0
var lhPopSuppress = 0
var lhPopSuppressTimer = 0
var lhSyncTimer = 0
var lhLastRootBack = 0
var lhScrollIntentAt = 0
var lhHistoryReady = false
var lhRawScrollTo = window.scrollTo

function lhIsPlainOverlay(el) { return el.id !== 'nav-drawer' && el.id !== 'carty-panel' }
function lhOverlayIsOpen(el) { return el.id === 'nav-drawer' ? el.classList.contains('open') : !el.classList.contains('hidden') }

function lhOverlayChanged(el) {
  const open = lhOverlayIsOpen(el)
  const at = lhOverlayStack.indexOf(el)
  if (open && at === -1) {
    if (!lhOverlayStack.length) lhSavedScrollY = window.scrollY || 0
    lhOverlayStack.push(el)
    // Later windows must always sit above earlier ones, whatever their CSS z-index says.
    if (lhIsPlainOverlay(el)) el.style.zIndex = String(10010 + lhOverlayStack.length * 2)
  } else if (!open && at !== -1) {
    lhOverlayStack.splice(at, 1)
    el.style.zIndex = ''
    if (!lhOverlayStack.length) lhRestoreScroll()
  } else {
    return
  }
  // Keep the page behind locked for as long as any window is open (one window closing must not unlock it).
  // (the mobile menu counts too: without this, scrolling inside the menu scrolled the page behind it)
  document.documentElement.classList.toggle('lightbox-open', lhOverlayStack.some((o) => lhIsPlainOverlay(o) || o.id === 'nav-drawer'))
  lhScheduleHistorySync()
}

function lhWatchOverlay(el) {
  if (!lhOverlayWatched) lhOverlayWatched = new WeakSet()
  if (lhOverlayWatched.has(el)) return
  lhOverlayWatched.add(el)
  new MutationObserver(() => lhOverlayChanged(el)).observe(el, { attributes: true, attributeFilter: ['class'] })
  lhOverlayChanged(el)
}

function lhScanOverlays(root) {
  const scope = root || document
  if (scope.matches && scope.matches(LH_OVERLAY_SELECTOR)) lhWatchOverlay(scope)
  if (scope.querySelectorAll) scope.querySelectorAll(LH_OVERLAY_SELECTOR).forEach(lhWatchOverlay)
}

function lhCloseOverlayEl(el) {
  const btn = el.querySelector('[data-close-listing-overlay], .lightbox-close, button[id$="-close"], button[aria-label^="Close"]')
  if (btn) btn.click()
  if (lhOverlayIsOpen(el)) el.click() // most windows also close when their dark backdrop is tapped
  if (lhOverlayIsOpen(el)) { el.classList.add('hidden'); el.setAttribute('aria-hidden', 'true') }
}

// --- scroll position -------------------------------------------------------
;['scrollTo', 'scrollBy', 'scroll'].forEach((name) => {
  const original = window[name]
  if (typeof original !== 'function') return
  window[name] = function (...args) { lhScrollIntentAt = Date.now(); return original.apply(this, args) }
})
if (window.Element && Element.prototype.scrollIntoView) {
  const originalScrollIntoView = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = function (...args) { lhScrollIntentAt = Date.now(); return originalScrollIntoView.apply(this, args) }
}
;['wheel', 'touchmove'].forEach((name) => window.addEventListener(name, () => { lhScrollIntentAt = Date.now() }, { passive: true }))

// When the last window closes, put the page back where it was. If something scrolled the page on purpose
// (Browse, edit listing, ...) that wins and nothing is restored.
function lhRestoreScroll() {
  const y = lhSavedScrollY
  const closedAt = Date.now()
  const check = () => {
    if (lhOverlayStack.length || lhScrollIntentAt > closedAt - 50) return
    if (Math.abs((window.scrollY || 0) - y) > 30) lhRawScrollTo.call(window, 0, y)
  }
  requestAnimationFrame(check)
  setTimeout(check, 160)
  setTimeout(check, 480)
}

// --- Back button -----------------------------------------------------------
// History looks like:  [before LinkHub] [root] [guard = depth 0] [window 1 = depth 1] [window 2 = depth 2] ...
// Back closes the top window. Back from the guard shows "press back again", a second press within 2.5s leaves.
function lhHistoryDepth() {
  const s = history.state
  return s && s.lh ? Number(s.lhDepth) || 0 : 0
}

function lhScheduleHistorySync(delay = 0) {
  clearTimeout(lhSyncTimer)
  lhSyncTimer = setTimeout(lhSyncHistory, delay)
}

function lhSyncHistory() {
  if (!lhHistoryReady) return
  if (lhPopSuppress > 0) { lhScheduleHistorySync(120); return } // a history jump of ours is still in flight
  const want = lhOverlayStack.length
  const have = lhHistoryDepth()
  if (want > have) {
    for (let d = have + 1; d <= want; d++) history.pushState({ lh: 1, lhDepth: d }, '')
  } else if (want < have) {
    lhPopSuppress++
    clearTimeout(lhPopSuppressTimer)
    lhPopSuppressTimer = setTimeout(() => { lhPopSuppress = 0 }, 900)
    history.go(want - have)
  }
}

function lhRootBack() {
  const now = Date.now()
  if (now - lhLastRootBack < 2500) {
    lhLastRootBack = 0
    // Second press: let the browser take over so LinkHub really closes.
    lhHistoryReady = false
    history.back() // leaves LinkHub when there is a page before it
    // When LinkHub is the first page of the tab or the installed app there is nothing before it. We stay on the
    // bottom entry, and the next Back press is the browser's own, which closes the tab/app. Our handling comes
    // back for when the page is used again.
    setTimeout(() => { lhHistoryReady = true }, 800)
    return
  }
  lhLastRootBack = now
  history.pushState({ lh: 1, lhDepth: 0 }, '') // stay on the page
  if (typeof showUxToast === 'function') showUxToast('Press back again to leave LinkHub')
}

window.addEventListener('popstate', (event) => {
  if (!lhHistoryReady) return
  if (lhPopSuppress > 0) { lhPopSuppress--; lhScheduleHistorySync(); return }
  const st = event.state
  if (st && st.lhRoot) {
    if (lhOverlayStack.length) {
      // Landed on the bottom entry while windows are open: close them all and put the guard back.
      for (let n = lhOverlayStack.length; n > 0; n--) lhCloseOverlayEl(lhOverlayStack[n - 1])
      history.pushState({ lh: 1, lhDepth: 0 }, '')
      return
    }
    lhRootBack()
    return
  }
  if (!st || !st.lh) return
  const depth = Number(st.lhDepth) || 0
  for (let n = lhOverlayStack.length; n > depth; n--) lhCloseOverlayEl(lhOverlayStack[n - 1])
  lhScheduleHistorySync()
})

function lhInitWindows() {
  try {
    const st = history.state
    if (!(st && (st.lh || st.lhRoot))) {
      history.replaceState({ lhRoot: 1 }, '')
      history.pushState({ lh: 1, lhDepth: 0 }, '')
    } else if (st.lhRoot) {
      history.pushState({ lh: 1, lhDepth: 0 }, '') // reloaded on the bottom entry: put the guard back
    }
    lhHistoryReady = true
  } catch { /* History API not available (very old in-app browsers) */ }
  lhScanOverlays(document)
  new MutationObserver((mutations) => {
    mutations.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) lhScanOverlays(n) }))
  }).observe(document.body, { childList: true })
  lhScheduleHistorySync()
}
lhInitWindows()

// Logo fallback: if a store logo fails to load, swap the broken-image icon for
// the store's initials on a coloured tile. Images opt in with data-logo-name.
document.addEventListener('error', (event) => {
  const img = event.target
  if (!(img instanceof HTMLImageElement)) return
  // Listing thumbnails in chats/notifications: the saved photo can disappear (for example when the seller
  // deletes their account, their images are removed from Storage), so fall back to the placeholder icon.
  if (img.classList.contains('notification-thumb') || img.classList.contains('chat-listing-thumb')) {
    const placeholder = document.createElement('span')
    placeholder.className = img.classList.contains('notification-thumb') ? 'notification-thumb notification-thumb-empty' : 'chat-listing-thumb'
    placeholder.setAttribute('aria-hidden', 'true')
    placeholder.innerHTML = ICON_LISTINGS
    img.replaceWith(placeholder)
    return
  }
  if (img.dataset.logoName === undefined) return
  const name = img.dataset.logoName
  const badge = document.createElement('span')
  badge.className = 'logo-initials'
  badge.setAttribute('aria-hidden', 'true')
  badge.textContent = initialsFromName(name)
  badge.style.background = `hsl(${avatarHueFromSeed(img.dataset.logoSeed || name)} 55% 38%)`
  img.replaceWith(badge)
}, true)

// Only real web links may become clickable. A stored value such as "javascript:..." would run code in the
// visitor's browser when clicked, so anything that isn't http(s) is dropped.
function safeWebUrl(value) {
  try {
    const u = new URL(String(value || '').trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : ''
  } catch { return '' }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

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


// Smooth, unified navigation transitions for section jumps.
if (!document.getElementById('linkhub-navigation-smooth-runtime')) {
  const style = document.createElement('style')
  style.id = 'linkhub-navigation-smooth-runtime'
  style.textContent = `
    html { scroll-behavior: smooth; }
    .mobile-bottom-nav, .nav-drawer, .nav-drawer-backdrop {
      transition-timing-function: cubic-bezier(.22,.61,.36,1);
    }
    .mobile-bottom-nav {
      transition: transform 220ms ease, opacity 180ms ease;
    }
    .mobile-bottom-nav.nav-hidden {
      transform: translateY(110%);
      opacity: 0;
      pointer-events: none;
    }
  `
  document.head.appendChild(style)
}

// initial load
fetchAndRenderListings().then(openLinkedListingFromUrl)

// Register service worker for PWA install support + app-shell caching.
// Keep the registration on page load so the manifest + service worker are present
// for browsers that use beforeinstallprompt.
// updateViaCache:'none' stops the browser's HTTP cache from serving a stale
// copy of sw.js itself (GitHub Pages doesn't send strong no-cache headers, so
// without this a phone can keep running an old worker for a long time,
// which can make Chrome/Safari decide the site isn't installable at all).
window.addEventListener('offline', () => showUxToast('You’re offline. Some things won’t work until you’re back online.'))
window.addEventListener('online', () => showUxToast('Back online.'))
if (navigator.onLine === false) setTimeout(() => showUxToast('You’re offline. Some things won’t work until you’re back online.'), 2600)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch((err) => {
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
});

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
})();



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
    const completionFields=[nameDone,!!String(storeManageCategory?.value||'').trim(),!!String(storeManageType?.value||'').trim(),!!String(storeManageTagline?.value||'').trim(),!!String(storeManagePhone?.value||'').trim(),!!String(storeManageLocation?.value||'').trim(),!!String(storeManageBio?.value||'').trim(),!!String(storeManageHours?.value||'').trim(),!!String(storeManageFulfilment?.value||'').trim(),!!(storeManageLogo?.files?.length||storeManageLogoPreview?.src)]; if(storeSummaryComplete) storeSummaryComplete.textContent=`${completionFields.filter(Boolean).length} of ${completionFields.length}`
  }

  ;[storeManageName, storeManageCategory, storeManageType, storeManageTagline, storeManagePhone, storeManageWebsite, storeManageWhatsapp, storeManageInstagram, storeManageLocation, storeManageAddress, storeManageBio, storeManageHours, storeManageFulfilment].forEach((el) => el?.addEventListener('input', updateStoreProgress))
  ;[storeManageLogo, storeManageBanner].forEach((el) => el?.addEventListener('change', updateStoreProgress))

  window.linkhubRefreshStoreUx = updateStoreProgress
  // Keep the existing no-signup browsing/cart flow as the reciprocity piece.
  updateListingProgress()
  updateStoreProgress()
})()