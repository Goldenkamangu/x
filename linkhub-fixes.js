// LinkHub safety/compatibility fixes for the live /x app.
// This file intentionally sits on top of app.js instead of replacing it.

(() => {
  const SUPABASE_URL = 'https://izdwacnhqrtsgngmsigu.supabase.co'
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzaWd3YWNuYXJ0c2duZ21zaWd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NDk4MjksImV4cCI6MjEwMTUyNTgyOX0.coV2SWeECtgXNeLtHOJ2T6_ekmV7Ynya35Ewl8oH7GI'

  // ---------------------------------------------------------------
  // 1. Broken/deleted image cleanup in the UI
  // ---------------------------------------------------------------
  const style = document.createElement('style')
  style.id = 'linkhub-live-fix-style'
  style.textContent = `
    .linkhub-image-unavailable{
      width:100%;
      min-height:120px;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:16px;
      box-sizing:border-box;
      border:1px dashed rgba(127,127,127,.24);
      background:rgba(127,127,127,.06);
      color:rgba(127,127,127,.76);
      font-size:.78rem;
      line-height:1.4;
      text-align:center;
    }
    .gallery-thumb .linkhub-image-unavailable,
    .mini-listing-img .linkhub-image-unavailable,
    .store-logo .linkhub-image-unavailable,
    .store-logo-preview .linkhub-image-unavailable{
      min-height:48px;
      padding:8px;
      font-size:.68rem;
    }
    .linkhub-image-unavailable + *{max-width:100%;}
  `
  document.head.appendChild(style)

  function isLikelyRemoteImage(img) {
    const src = String(img?.currentSrc || img?.src || img?.getAttribute('src') || '')
    return src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')
  }

  function replaceBrokenImage(img) {
    if (!(img instanceof HTMLImageElement)) return
    if (img.dataset.linkhubBroken === '1') return
    if (!isLikelyRemoteImage(img)) return
    img.dataset.linkhubBroken = '1'

    const placeholder = document.createElement('div')
    placeholder.className = 'linkhub-image-unavailable'
    placeholder.textContent = 'Image unavailable'
    placeholder.setAttribute('role', 'img')
    placeholder.setAttribute('aria-label', 'Image unavailable')
    img.replaceWith(placeholder)

    const button = placeholder.closest('button')
    if (button && (button.classList.contains('gallery-main-btn') || button.classList.contains('gallery-thumb'))) {
      button.disabled = true
      button.setAttribute('aria-disabled', 'true')
      button.style.cursor = 'default'
      button.onclick = null
    }

    const gallery = placeholder.closest('.listing-gallery, .listing-overlay-gallery')
    if (gallery && !gallery.querySelector('img')) gallery.classList.add('empty')
  }

  function watchImage(img) {
    if (!(img instanceof HTMLImageElement) || img.dataset.linkhubWatched === '1') return
    img.dataset.linkhubWatched = '1'
    img.addEventListener('error', () => replaceBrokenImage(img), { once: true })
    if (img.complete && img.naturalWidth === 0) queueMicrotask(() => replaceBrokenImage(img))
  }

  function scanImages(root = document) {
    if (root instanceof HTMLImageElement) watchImage(root)
    root.querySelectorAll?.('img').forEach(watchImage)
  }

  scanImages()
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scanImages(node)
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true })

  // ---------------------------------------------------------------
  // 2. Store compatibility fix
  // Some older rows may use seller_id / owner_id / profile_id instead of
  // user_id. The existing app indexed only user_id/id, so those stores could
  // exist in Supabase but never get a "Visit Store" button.
  // ---------------------------------------------------------------
  async function repairStoreIndex() {
    if (!window.supabase?.createClient) return
    try {
      const db = window.__linkhubFixSupabase || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      window.__linkhubFixSupabase = db
      const { data: stores, error } = await db.from('stores').select('*')
      if (error || !Array.isArray(stores)) return

      const index = {}
      for (const row of stores) {
        const owner = row?.user_id ?? row?.owner_id ?? row?.seller_id ?? row?.profile_id ?? row?.created_by ?? row?.id
        if (owner != null) index[String(owner)] = row
      }
      window.linkhubStoreCompatIndex = index

      // The main app keeps its own storesById variable inside the module.
      // We cannot directly mutate that lexical variable, so rebuild missing
      // Visit Store buttons in rendered listing cards from the live rows.
      const listings = document.querySelectorAll('[data-listing-id]')
      const byListing = {}
      const { data: listingRows } = await db.from('listings').select('id,user_id,seller_id,owner_id,profile_id')
      for (const row of listingRows || []) byListing[String(row.id)] = row

      for (const card of listings) {
        const id = card.dataset.listingId
        const listing = byListing[String(id)]
        const owner = listing?.user_id ?? listing?.seller_id ?? listing?.owner_id ?? listing?.profile_id
        if (owner == null) continue
        if (!index[String(owner)]) continue
        if (card.querySelector('.visit-store-btn')) continue

        const store = index[String(owner)]
        const name = store?.name ?? store?.store_name ?? store?.business_name ?? store?.title ?? 'Visit Store'
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'visit-store-btn'
        button.dataset.storeId = String(owner)
        button.textContent = `Visit Store: ${name}`
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          const opener = window.openStore
          if (typeof opener === 'function') opener(String(owner))
        })
        card.appendChild(button)
      }
    } catch (error) {
      console.warn('LinkHub store compatibility fix:', error)
    }
  }

  // Give app.js time to render its first listing batch, then repeat after
  // search/filter/store rendering so the compatibility index stays current.
  [900, 2500, 5000, 9000].forEach((delay) => setTimeout(repairStoreIndex, delay))

  // ---------------------------------------------------------------
  // 3. Remove the visual "loading" illusion after a deleted image is gone.
  // ---------------------------------------------------------------
  window.addEventListener('online', () => setTimeout(() => scanImages(), 100))
  window.addEventListener('load', () => setTimeout(() => scanImages(), 100))
})()
