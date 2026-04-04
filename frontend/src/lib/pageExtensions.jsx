import React from 'react'
import { Extension, Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'

function PageBreakComponent() {
  return (
    <NodeViewWrapper className="page-break-wrapper">
      <div className="page-break-gap">
        <div className="page-number-label">Page Break</div>
      </div>
    </NodeViewWrapper>
  )
}

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }]
  },

  renderHTML() {
    return ['div', { 'data-type': 'page-break', class: 'page-break' }]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageBreakComponent, { as: 'div' })
  },
})

export const SmartPagination = Extension.create({
  name: 'smartPagination',

  addOptions() {
    return {
      pageHeight: 864,
    }
  },

  addCommands() {
    return {
      checkPagination: () => ({ editor, view, tr, dispatch }) => {
        const { selection } = tr
        const { $from } = selection

        if (!$from.parent.isTextblock || $from.parentOffset < $from.parent.content.size) {
          return false
        }

        try {
          const coords = view.coordsAtPos($from.pos)
          let lastBreakPos = 0

          editor.state.doc.descendants((node, pos) => {
            if (pos >= $from.pos) return false
            if (node.type.name === 'pageBreak') {
              lastBreakPos = pos
            }
            return true
          })

          let lastBreakY = 0
          if (lastBreakPos > 0) {
            try {
              lastBreakY = view.coordsAtPos(lastBreakPos).bottom
            } catch (_) {
              lastBreakY = 0
            }
          } else {
            lastBreakY = view.coordsAtPos(1).top
          }

          const currentHeight = coords.bottom - lastBreakY
          if (currentHeight > this.options.pageHeight) {
            if (dispatch) {
              tr.insert(tr.selection.to, editor.schema.nodes.pageBreak.create())
            }
            return true
          }
        } catch (_) {}

        return false
      },
    }
  },

  addProseMirrorPlugins() {
    let isInserting = false
    let debounceTimer = null

    return [
      new Plugin({
        key: new PluginKey('smartPagination'),
        view: () => ({
          update: (view, prevState) => {
            if (prevState && prevState.doc.eq(view.state.doc)) return
            if (isInserting) return
            if (view.dom.clientWidth < 600) return

            if (debounceTimer) clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => {
              if (view.isDestroyed || isInserting) return
              isInserting = true
              try {
                this.editor.commands.checkPagination()
              } finally {
                setTimeout(() => {
                  isInserting = false
                }, 100)
              }
            }, 1000)
          },
          destroy: () => {
            if (debounceTimer) clearTimeout(debounceTimer)
          },
        }),
      }),
    ]
  },
})
