import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

(() => {
  const SUPABASE_URL = 'https://izdwacnhqrtsgngmsigu.supabase.co'
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6ZHdhY25ocXJ0c2duZ21zaWd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NDk4MjksImV4cCI6MjEwMTUyNTgyOX0.coV2SWeECtgXNeLtHOJ2T6_ekmV7Ynya35Ewl8oH7GI'

  // 1. Broken/deleted images: replace dead URLs with a clean state.
  const style = document.createElement('style')
  style.id = 'linkhub-live-fix-style'
  style.textContent = `
    .linkhub-image-unavailable{width:100%;min-height:120px;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;border:1px dashed rgba(127,127,127,.24);background:rgba(127,127,127,.06);color:rgba(127,127,127,.76);font-size:.78rem;line-height:1.4;text-align:center}
    .gallery-thumb .linkhub-image-unavailable,.mini-listing-img .linkhub-image-unavailable,.store-logo .linkhub-image-unavailable,.store-logo-preview .linkhub-image-unavailable{min-height:48px;padding:8px;font-size:.68rem}
  `
  document.head.appendChild(style)

  function isLikelyImage(img) {
    const src = String(img?.currentSrc || img?.src || img?.getAttribute('src') || '')
    return /^(https?:|blob:)/i.test(src)
  }

  function replaceBrokenImage(img) {
    if (!(img instanceof HTMLImageElement) || img.dataset.linkhubBroken === '1') return
    if (!isLikelyImage(img)) return
    img.dataset.linkhubBroken = '1'
    const placeholder = document.createElement('div')
    placeholder.className = 'linkhub-image-unavailable'
    placeholder.textContent = 'Image unavailable'
    placeholder.setAttribute('role', 'img')
    placeholder.setAttribute('aria-label', 'Image unavailable')
    img.replaceWith(placeholder)
    const button = placeholder.closest('button.gallery-main-btn, button.gallery-thumb')
    if (button) {
      button.disabled = true
      button.setAttribute('aria-disabled', 'true')
      button.style.cursor = 'default'
    }
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
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) scanImages(node)
    }))
  }).observe(document.documentElement, { childList: true, subtree: true })

  // 2. Store compatibility: recognise older store rows that use another
  // owner column. The existing app indexes user_id/id only, so those stores
  // can exist in Supabase but never get a Visit Store button.
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  async function repairStoreIndex() {
    try {
      const [{ data: stores, error: storeError }, { data: listings, error: listingError }] = await Promise.all([
        db.from('stores').select('*'),
        db.from('listings').select('id,user_id,seller_id,owner_id,profile_id')
      ])
      if (storeError || listingError || !Array.isArray(stores) || !Array.isArray(listings)) return

      const storesByOwner = {}
      for (const store of stores) {
        const owner = store?.user_id ?? store?.owner_id ?? store?.seller_id ?? store?.profile_id ?? store?.created_by ?? store?.id
        if (owner != null) storesByOwner[String(owner)] = store
      }

      for (const card of document.querySelectorAll('[data-listing-id]')) {
        const listing = listings.find(row => String(row.id) === String(card.dataset.listingId))
        const owner = listing?.user_id ?? listing?.seller_id ?? listing?.owner_id ?? listing?.profile_id
        if (owner == null || !storesByOwner[String(owner)] || card.querySelector('.visit-store-btn')) continue
        const store = storesByOwner[String(owner)]
        const name = store?.name ?? store?.store_name ?? store?.business_name ?? store?.title ?? 'Visit Store'
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'visit-store-btn'
        button.dataset.storeId = String(owner)
        button.textContent = `Visit Store: ${name}`
        card.appendChild(button)
      }
    } catch (error) {
      console.warn('LinkHub store compatibility fix:', error)
    }
  }

  ;[1000, 3000, 6000, 10000].forEach(delay => setTimeout(repairStoreIndex, delay))
  window.addEventListener('load', () => setTimeout(repairStoreIndex, 250))
})()
