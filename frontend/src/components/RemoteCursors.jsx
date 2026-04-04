import { useEffect, useRef } from 'react'

// Renders coloured cursors/selections for remote users directly over the Quill editor
export default function RemoteCursors({ users, getQuill, focusMode }) {
  const cursorsRef = useRef({}) // clientId → { caret, flag }
  const containerRef = useRef(null)

  useEffect(() => {
    const quill = getQuill()
    if (!quill) return

    const editorEl = quill.root
    const parent = editorEl.parentElement
    if (!parent) return

    // Clean up cursors for users no longer present
    const activeIds = new Set(users.map(u => String(u.clientId)))
    Object.keys(cursorsRef.current).forEach(id => {
      if (!activeIds.has(id)) {
        cursorsRef.current[id]?.caret?.remove()
        cursorsRef.current[id]?.flag?.remove()
        delete cursorsRef.current[id]
      }
    })

    users.forEach(user => {
      if (!user.cursor || user.cursor.index == null) return
      const id = String(user.clientId)
      const bounds = quill.getBounds(user.cursor.index, user.cursor.length || 0)
      if (!bounds) return

      const editorRect = editorEl.getBoundingClientRect()
      const parentRect = parent.getBoundingClientRect()
      const offsetX = editorRect.left - parentRect.left
      const offsetY = editorRect.top - parentRect.top

      const opacity = focusMode ? 0.3 : 1

      if (!cursorsRef.current[id]) {
        const caret = document.createElement('div')
        caret.style.cssText = `
          position: absolute; width: 2px; pointer-events: none; z-index: 50;
          border-radius: 1px; transition: all 80ms ease;
        `
        const flag = document.createElement('div')
        flag.style.cssText = `
          position: absolute; pointer-events: none; z-index: 51;
          font-size: 10px; font-weight: 600; padding: 2px 6px;
          border-radius: 4px 4px 4px 0; white-space: nowrap;
          font-family: 'Inter', sans-serif; transition: all 80ms ease;
          opacity: 0;
        `
        parent.appendChild(caret)
        parent.appendChild(flag)
        cursorsRef.current[id] = { caret, flag }
        // Show flag briefly on move
        setTimeout(() => { flag.style.opacity = String(opacity) }, 50)
        setTimeout(() => { flag.style.opacity = '0' }, 2000)
      }

      const { caret, flag } = cursorsRef.current[id]
      const x = offsetX + bounds.left
      const y = offsetY + bounds.top

      caret.style.left = x + 'px'
      caret.style.top = y + 'px'
      caret.style.height = bounds.height + 'px'
      caret.style.backgroundColor = user.color
      caret.style.opacity = String(opacity)

      flag.style.left = x + 'px'
      flag.style.top = (y - 18) + 'px'
      flag.style.backgroundColor = user.color
      flag.style.color = '#fff'
      flag.textContent = user.name || '?'
      flag.style.opacity = String(opacity)
    })

    // Cleanup removed cursors
    return () => {}
  }, [users, getQuill, focusMode])

  // On unmount, clean up all cursors
  useEffect(() => {
    return () => {
      Object.values(cursorsRef.current).forEach(({ caret, flag }) => {
        caret?.remove()
        flag?.remove()
      })
      cursorsRef.current = {}
    }
  }, [])

  return null
}
