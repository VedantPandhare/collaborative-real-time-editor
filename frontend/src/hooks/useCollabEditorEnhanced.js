import { useEffect, useRef, useCallback, useState } from 'react'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { getLocalUser } from '../lib/colors'
import { MESSAGE_SYNC, MESSAGE_AWARENESS, MESSAGE_CHAT, MESSAGE_CHAT_HISTORY, MESSAGE_CONTENT } from '../lib/wsProtocol'
import { FontFamily, FontSize, TextStyle } from '../lib/tiptapExtensions'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

function textToHtml(text) {
  if (typeof text === 'string' && text.trim().startsWith('<')) return text
  return String(text || '')
    .split('\n')
    .map((line) => line.trim() ? `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : '<p></p>')
    .join('')
}

export function useCollabEditor({ docId, readonly = false, initialContent = '', onContentChange, onChatMessage, onChatHistory }) {
  const [connected, setConnected] = useState(false)
  const [users, setUsers] = useState([])
  const ydocRef = useRef(new Y.Doc())
  const awarenessRef = useRef(new Awareness(ydocRef.current))
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const mountedRef = useRef(true)
  const applyingRemoteRef = useRef(false)
  const lastHtmlRef = useRef('')

  const editor = useEditor({
    editable: !readonly,
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: readonly, autolink: true }),
      Image,
      Placeholder.configure({ placeholder: readonly ? '' : "Start writing... or type '/' for commands" }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    editorProps: {
      attributes: {
        class: readonly ? 'word-page-editor prose-editor is-readonly' : 'word-page-editor prose-editor',
      },
    },
    content: textToHtml(initialContent),
    onSelectionUpdate: ({ editor: nextEditor }) => {
      const state = awarenessRef.current.getLocalState()
      if (state && !readonly) {
        const { from, to } = nextEditor.state.selection
        awarenessRef.current.setLocalStateField('cursor', { index: from, length: Math.max(to - from, 0) })
      }
    },
    onUpdate: ({ editor: nextEditor }) => {
      if (applyingRemoteRef.current) return
      lastHtmlRef.current = nextEditor.getHTML()
      onContentChange?.({
        html: lastHtmlRef.current,
        text: nextEditor.getText(),
      })

      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MESSAGE_CONTENT)
        encoding.writeVarString(enc, JSON.stringify({ html: lastHtmlRef.current }))
        ws.send(encoding.toUint8Array(enc))
      }
    },
  })

  useEffect(() => {
    const awareness = awarenessRef.current
    const handler = () => {
      const nextUsers = []
      awareness.getStates().forEach((state, clientId) => {
        if (state?.name) nextUsers.push({ clientId, ...state })
      })
      setUsers(nextUsers)
    }
    awareness.on('change', handler)
    return () => awareness.off('change', handler)
  }, [])

  useEffect(() => {
    if (!editor) return
    const html = textToHtml(initialContent)
    if (html && editor.getHTML() !== html) {
      applyingRemoteRef.current = true
      editor.commands.setContent(html, false)
      lastHtmlRef.current = html
      queueMicrotask(() => { applyingRemoteRef.current = false })
    }
  }, [editor, initialContent])

  const connect = useCallback(() => {
    if (!docId || !mountedRef.current) return

    const ydoc = ydocRef.current
    const awareness = awarenessRef.current
    const ws = new WebSocket(`${WS_URL}?docId=${docId}`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

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
          if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc))
        }
        return
      }

      if (msgType === MESSAGE_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder)
        awarenessProtocol.applyAwarenessUpdate(awareness, update, ws)
        return
      }

      if (msgType === MESSAGE_CHAT) {
        try {
          onChatMessage?.(JSON.parse(decoding.readVarString(decoder)))
        } catch (_) {}
        return
      }

      if (msgType === MESSAGE_CHAT_HISTORY) {
        try {
          onChatHistory?.(JSON.parse(decoding.readVarString(decoder)))
        } catch (_) {}
        return
      }

      if (msgType === MESSAGE_CONTENT) {
        try {
          const payload = JSON.parse(decoding.readVarString(decoder))
          if (editor && payload.html && payload.html !== lastHtmlRef.current) {
            applyingRemoteRef.current = true
            editor.commands.setContent(payload.html, false)
            lastHtmlRef.current = payload.html
            setTimeout(() => { applyingRemoteRef.current = false }, 0)
          }
        } catch (_) {}
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnected(false)
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, 3000)
    }

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

    const updateHandler = (update, origin) => {
      if (origin === ws || ws.readyState !== WebSocket.OPEN || !mountedRef.current) return
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MESSAGE_SYNC)
      syncProtocol.writeUpdate(enc, update)
      ws.send(encoding.toUint8Array(enc))
    }
    ydoc.on('update', updateHandler)

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
  }, [docId, editor, onChatHistory, onChatMessage])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimerRef.current)
      wsRef.current?._cleanup?.()
      wsRef.current?.close()
      awarenessRef.current.destroy()
      ydocRef.current.destroy()
    }
  }, [connect])

  const sendChat = useCallback((message) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const { name, color } = getLocalUser()
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MESSAGE_CHAT)
    encoding.writeVarString(enc, JSON.stringify({ userName: name, userColor: color, message }))
    ws.send(encoding.toUint8Array(enc))
  }, [])

  const updateLocalUser = useCallback((name, color) => {
    awarenessRef.current.setLocalState({
      name,
      color,
      cursor: awarenessRef.current.getLocalState()?.cursor ?? null,
    })
  }, [])

  const getYdoc = useCallback(() => ydocRef.current, [])
  const getEditor = useCallback(() => editor, [editor])

  return { connected, users, sendChat, updateLocalUser, getYdoc, getEditor, editor }
}
