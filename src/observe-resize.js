/**
 *
 * @param el {HTMLElement}
 * @param cb {function}
 * @return {(function(): void)}
 */
export function observeResize(el, cb) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const ctx = {
    cb
  }

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      ctx.cb()
    })
    ro.observe(el)

    return () => {
      ro.unobserve(el)
      delete ctx.cb
    }
  } else {
    let { width, height } = el.getClientRects().item(0)

    const callback = () => {
      let { width: newWidth, height: newHeight } = el.getClientRects().item(0)

      // only update if changed
      if (newWidth !== width || newHeight !== height) {
        ctx.cb()
        width = newWidth
        height = newHeight
      }
    }

    window.addEventListener('resize', callback, { passive: true })

    return () => {
      window.removeEventListener('resize', callback)
      delete ctx.cb
    }
  }
}