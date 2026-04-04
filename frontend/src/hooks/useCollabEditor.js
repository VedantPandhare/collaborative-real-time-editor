import { useEffect, useRef, useCallback, useState } from 'react'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { QuillBinding } from 'y-quill'
import Quill from 'quill'
import { getLocalUser } from '../lib/colors'
import { MESSAGE_SYNC, MESSAGE_AWARENESS, MESSAGE_CHAT, MESSAGE_CHAT_HISTORY } from '../lib/wsProtocol'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export function useCollabEditor({ docId, containerRef, readonly = false, onChatMessage, onChatHistory }) {
  const [connected, setConnected] = useState(false)
  const [users, setUsers] = useState([])
  const ydocRef = useRef(null)
  const awarenessRef = useRef(null)
  const wsRef = useRef(null)
  const quillRef = useRef(null)
  const bindingRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const mountedRef = useRef(true)

  // ── Init Quill ──────────────────────────────────────────────────────────────
  const initQuill = useCallback(() => {
    if (!containerRef.current || quillRef.current) return

    quillRef.current = new Quill(containerRef.current, {
      theme: false,
      readOnly: readonly,
      placeholder: readonly ? '' : "Start writing… or type '/' for commands",
      modules: {
        toolbar: false, // we have our own toolbar
        history: { delay: 0, maxStack: 0, userOnly: false },
      },
      formats: ['bold', 'italic', 'underline', 'strike', 'code', 'link',
                'header', 'blockquote', 'code-block', 'list', 'indent',
                'align', 'color', 'background'],
    })
  }, [containerRef, readonly])

  // ── Connect WebSocket ───────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!docId || !mountedRef.current) return

    const ydoc = ydocRef.current
    const awareness = awarenessRef.current
    const ws = new WebSocket(`${WS_URL}?docId=${docId}`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnected(true)

      // Set local awareness state
      const { name, color } = getLocalUser()
      awareness.setLocalState({ name, color, cursor: null })
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      const uint8 = new Uint8Array(event.data)
      const decoder = decoding.createDecoder(uint8)
      const msgType = decoding.readVarUint(decoder)

      if (msgType === MESSAGE_SYNC) {
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MESSAGE_SYNC)
        const syncType = syncProtocol.readSyncMessage(decoder, enc, ydoc, ws)
        if (syncType === syncProtocol.messageYjsSyncStep1 || syncType === syncProtocol.messageYjsSyncStep2) {
          if (encoding.length(enc) > 1) {
            ws.send(encoding.toUint8Array(enc))
          }
        }
      } else if (msgType === MESSAGE_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder)
        awarenessProtocol.applyAwarenessUpdate(awareness, update, ws)
      } else if (msgType === MESSAGE_CHAT) {
        try {
          const payload = JSON.parse(decoding.readVarString(decoder))
          onChatMessage?.(payload)
        } catch (_) {}
      } else if (msgType === MESSAGE_CHAT_HISTORY) {
        try {
          const history = JSON.parse(decoding.readVarString(decoder))
          onChatHistory?.(history)
        } catch (_) {}
      }
    }

    ws.onerror = () => {}

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnected(false)
      // Reconnect with back-off
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, 3000)
    }

    // Send initial sync step 1
    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnected(true)
      const { name, color } = getLocalUser()
      awareness.setLocalState({ name, color, cursor: null })

      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MESSAGE_SYNC)
      syncProtocol.writeSyncStep1(enc, ydoc)
      ws.send(encoding.toUint8Array(enc))
    }

    // Forward local Y updates to server
    const updateHandler = (update, origin) => {
      if (origin === ws || !mountedRef.current) return
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MESSAGE_SYNC)
      syncProtocol.writeUpdate(enc, update)
      if (ws.readyState === WebSocket.OPEN) ws.send(encoding.toUint8Array(enc))
    }
    ydoc.on('update', updateHandler)

    // Forward awareness updates to server
    const awarenessHandler = ({ added, updated, removed }) => {
      const changedClients = [...added, ...updated, ...removed]
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MESSAGE_AWARENESS)
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients))
      if (ws.readyState === WebSocket.OPEN) ws.send(encoding.toUint8Array(enc))
    }
    awareness.on('change', awarenessHandler)

    ws._cleanup = () => {
      ydoc.off('update', updateHandler)
      awareness.off('change', awarenessHandler)
    }
  }, [docId, onChatMessage, onChatHistory])

  // ── Awareness → users list ──────────────────────────────────────────────────
  useEffect(() => {
    const awareness = awarenessRef.current
    if (!awareness) return
    const handler = () => {
      const states = awareness.getStates()
      const list = []
      states.forEach((state, clientId) => {
        if (state.name) list.push({ clientId, ...state })
      })
      setUsers(list)
    }
    awareness.on('change', handler)
    return () => awareness.off('change', handler)
  }, [])

  // ── Main setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    const ydoc = new Y.Doc()
    const awareness = new Awareness(ydoc)
    ydocRef.current = ydoc
    awarenessRef.current = awareness

    initQuill()

    // Bind Quill ↔ Yjs
    if (quillRef.current && !readonly) {
      bindingRef.current = new QuillBinding(ydoc.getText('quill'), quillRef.current, awareness)
    }

    // Track cursor changes
    if (quillRef.current && !readonly) {
      quillRef.current.on('selection-change', (range) => {
        const state = awareness.getLocalState()
        if (state) {
          awareness.setLocalStateField('cursor', range ? { index: range.index, length: range.length } : null)
        }
      })
    }

    connect()

    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimerRef.current)
      wsRef.current?._cleanup?.()
      wsRef.current?.close()
      bindingRef.current?.destroy()
      awareness.destroy()
      ydoc.destroy()
      quillRef.current = null
      bindingRef.current = null
    }
  }, [docId]) // eslint-disable-line

  // ── Send chat message ───────────────────────────────────────────────────────
  const sendChat = useCallback((message) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const { name, color } = getLocalUser()
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MESSAGE_CHAT)
    encoding.writeVarString(enc, JSON.stringify({ userName: name, userColor: color, message }))
    ws.send(encoding.toUint8Array(enc))
  }, [])

  // ── Update local user ───────────────────────────────────────────────────────
  const updateLocalUser = useCallback((name, color) => {
    awarenessRef.current?.setLocalState({ name, color, cursor: awarenessRef.current.getLocalState()?.cursor ?? null })
  }, [])

  const getYdoc = useCallback(() => ydocRef.current, [])
  const getQuill = useCallback(() => quillRef.current, [])

  return { connected, users, sendChat, updateLocalUser, getYdoc, getQuill }
}
