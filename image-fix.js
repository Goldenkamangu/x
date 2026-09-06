// LinkHub image health + stale/deleted Storage image fix.
// Replaces broken/deleted marketplace/store images with a clean placeholder
// instead of leaving a browser-style "still loading" image area.

(() => {
  const STORAGE_MARKER = '/storage/v1/object/'
  const PLACEHOLDER_CLASS = 'linkhub-image-unavailable'

  if (document.getElementById('linkhub-image-fix-runtime')) return

  const style = document.createElement('style')
  style.id = 'linkhub-image-fix-runtime'
  style.textContent = `
    .${PLACEHOLDER_CLASS}{
      display:flex !important;
      align-items:center !important;
      justify-content:center !important;
      width:100% !important;
      min-height:120px !important;
      padding:18px !important;
      box-sizing:border-box !important;
      background:rgba(127,127,127,.08) !important;
      color:rgba(127,127,127,.8) !important;
      border:1px dashed rgba(127,127,127,.25) !important;
      text-align:center !important;
      font-size:.78rem !important;
      line-height:1.4 !important;
    }
    .${PLACEHOLDER_CLASS}.compact{min-height:48px !important;padding:8px !important;font-size:.7rem !important}
    .listing-img-wrap:has(.${PLACEHOLDER_CLASS}),
    .listing-gallery:has(.${PLACEHOLDER_CLASS}),
    .listing-overlay-gallery:has(.${PLACEHOLDER_CLASS}){overflow:hidden}
    .gallery-thumb:has(.${PLACEHOLDER_CLASS}){overflow:hidden}
  `
  document.head.appendChild(style)

  function isStorageImage(img) {
    const src = String(img?.currentSrc || img?.src || img?.getAttribute('src') || '')
    return src.includes(STORAGE_MARKER) || src.startsWith('blob:')
  }

  function placeholderFor(img) {
    const wrap = img.closest(
      '.listing-img-wrap, .gallery-thumb, .listing-overlay-image, .store-banner, .store-logo, .store-logo-preview, .mini-listing-img, .cart-item'
    )
    const compact = !!img.closest('.gallery-thumb, .mini-listing-img, .store-logo, .store-logo-preview')
    const placeholder = document.createElement('div')
    placeholder.className = `${PLACEHOLDER_CLASS}${compact ? ' compact' : ''}`
    placeholder.setAttribute('role', 'img')
    placeholder.setAttribute('aria-label', 'Image unavailable')
    placeholder.textContent = 'Image unavailable'

    if (img.classList.contains('gallery-main-image')) {
      placeholder.classList.add('listing-gallery-image-placeholder')
    }

    img.replaceWith(placeholder)

    // A failed thumbnail should no longer pretend it is clickable.
    const clickable = placeholder.closest('button.gallery-thumb, button.gallery-main-btn')
    if (clickable) {
      clickable.disabled = true
      clickable.setAttribute('aria-disabled', 'true')
      clickable.style.cursor = 'default'
      clickable.onclick = null
    }

    // If an entire overlay gallery has no usable images left, convert it to a
    // simple, clean empty state instead of an empty/loading-looking frame.
    const gallery = placeholder.closest('.listing-gallery, .listing-overlay-gallery')
    if (gallery && !gallery.querySelector('img')) {
      gallery.classList.add('empty')
      gallery.querySelectorAll('.listing-gallery-thumbs').forEach((el) => el.remove())
    }

    return placeholder
  }

  function markBroken(img) {
    if (!img || img.dataset.linkhubBroken === '1') return
    if (!isStorageImage(img)) return
    img.dataset.linkhubBroken = '1'
    placeholderFor(img)
  }

  function watchImage(img) {
    if (!(img instanceof HTMLImageElement)) return
    if (img.dataset.linkhubWatched === '1') return
    img.dataset.linkhubWatched = '1'
    img.addEventListener('error', () => markBroken(img), { once: true })
    // Images may already have failed before this script sees them.
    if (img.complete && img.naturalWidth === 0) {
      queueMicrotask(() => markBroken(img))
    }
  }

  function scan(root = document) {
    if (root instanceof HTMLImageElement) watchImage(root)
    root.querySelectorAll?.('img').forEach(watchImage)
  }

  scan()

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node)
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  // Re-scan after app rendering cycles, including Carty/search/store updates.
  const intervals = [250, 1000, 2500, 5000]
  intervals.forEach((delay) => setTimeout(() => scan(), delay))

  // Expose a tiny helper for future app code without modifying app.js.
  window.linkhubMarkBrokenImage = markBroken
})()
