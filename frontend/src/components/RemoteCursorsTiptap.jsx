import { useEffect, useRef } from 'react'

export default function RemoteCursorsTiptap({ users, getEditor }) {
  const cursorsRef = useRef({})

  useEffect(() => {
    const editor = getEditor()
    if (!editor) return

    const editorEl = editor.view.dom
    const parent = editorEl.parentElement
    if (!parent) return

    const activeIds = new Set(users.map((user) => String(user.clientId)))
    Object.keys(cursorsRef.current).forEach((id) => {
      if (!activeIds.has(id)) {
        cursorsRef.current[id]?.caret?.remove()
        cursorsRef.current[id]?.flag?.remove()
        delete cursorsRef.current[id]
      }
    })

    users.forEach((user) => {
      if (!user.cursor || user.cursor.index == null) return
      let coords
      try {
        coords = editor.view.coordsAtPos(user.cursor.index)
      } catch (_) {
        return
      }

      const id = String(user.clientId)
      if (!cursorsRef.current[id]) {
        const caret = document.createElement('div')
        caret.style.cssText = 'position:absolute;width:2px;pointer-events:none;z-index:50;border-radius:1px;transition:all 80ms ease;'
        const flag = document.createElement('div')
        flag.style.cssText = "position:absolute;pointer-events:none;z-index:51;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px 4px 4px 0;white-space:nowrap;font-family:'Inter',sans-serif;transition:all 80ms ease;opacity:0;"
        parent.appendChild(caret)
        parent.appendChild(flag)
        cursorsRef.current[id] = { caret, flag }
        setTimeout(() => { flag.style.opacity = '1' }, 50)
        setTimeout(() => { flag.style.opacity = '0' }, 2000)
      }

      const { caret, flag } = cursorsRef.current[id]
      const parentRect = parent.getBoundingClientRect()
      const x = coords.left - parentRect.left
      const y = coords.top - parentRect.top

      caret.style.left = `${x}px`
      caret.style.top = `${y}px`
      caret.style.height = `${Math.max(coords.bottom - coords.top, 20)}px`
      caret.style.backgroundColor = user.color

      flag.style.left = `${x}px`
      flag.style.top = `${y - 18}px`
      flag.style.backgroundColor = user.color
      flag.style.color = '#fff'
      flag.textContent = user.name || '?'
    })

    return () => {}
  }, [getEditor, users])

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
