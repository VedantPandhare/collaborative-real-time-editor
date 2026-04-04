import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { fetchAiAutocomplete } from './api'

export const AiAutocomplete = Extension.create({
  name: 'aiAutocomplete',

  addOptions() {
    return {
      debounceMs: 1800,
    }
  },

  addStorage() {
    return {
      suggestion: '',
      requestSuggestion: async () => {},
      clearSuggestion: () => {},
    }
  },

  addCommands() {
    return {
      acceptSuggestion: () => ({ tr, dispatch }) => {
        const suggestion = this.storage.suggestion
        if (!suggestion || !dispatch) return false

        const { from } = tr.selection
        tr.insertText(suggestion, from)
        this.storage.suggestion = ''
        dispatch(tr)
        return true
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.storage.suggestion) {
          return this.editor.commands.acceptSuggestion()
        }
        return false
      },
      Escape: () => {
        if (this.storage.suggestion) {
          this.storage.suggestion = ''
          this.editor.view.dispatch(this.editor.state.tr)
          return true
        }
        return false
      },
    }
  },

  addProseMirrorPlugins() {
    const key = new PluginKey('aiAutocomplete')
    let timeout = null
    let abortController = null

    const fetchSuggestion = async (view, force = false) => {
      const { state } = view
      if (!state.selection.empty) return

      const documentText = state.doc.textBetween(Math.max(0, state.selection.from - 2000), state.selection.from, '\n')
      if (!documentText.trim()) return
      if (!force && documentText.trim().length < 12) return

      abortController?.abort()
      abortController = new AbortController()

      try {
        const output = await fetchAiAutocomplete(documentText, abortController.signal)
        if (output && !view.isDestroyed) {
          this.storage.suggestion = output
          view.dispatch(view.state.tr)
        }
      } catch (_) {
        // silent fail
      }
    }

    this.storage.requestSuggestion = async () => {
      if (!this.editor?.view?.isDestroyed) {
        this.storage.suggestion = ''
        this.editor.view.dispatch(this.editor.state.tr)
        await fetchSuggestion(this.editor.view, true)
      }
    }

    this.storage.clearSuggestion = () => {
      if (!this.editor?.view?.isDestroyed) {
        this.storage.suggestion = ''
        this.editor.view.dispatch(this.editor.state.tr)
      }
    }

    return [
      new Plugin({
        key,
        props: {
          decorations: (state) => {
            const suggestion = this.storage.suggestion
            if (!suggestion) return DecorationSet.empty

            const { selection } = state
            if (!selection.empty) return DecorationSet.empty

            const widget = document.createElement('span')
            widget.className = 'ai-ghost-text'
            widget.textContent = suggestion
            widget.style.color = '#94a3b8'
            widget.style.fontStyle = 'italic'
            widget.style.pointerEvents = 'none'
            widget.style.userSelect = 'none'

            return DecorationSet.create(state.doc, [
              Decoration.widget(selection.from, widget, { side: 1 }),
            ])
          },
          handleKeyDown: (view, event) => {
            if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
              this.storage.suggestion = ''
              view.dispatch(view.state.tr)
            }
            return false
          },
        },
        view: (view) => ({
          update: (updatedView, prevState) => {
            const { state } = updatedView
            if (prevState && prevState.doc.eq(state.doc) && prevState.selection.eq(state.selection)) {
              return
            }

            this.storage.suggestion = ''
            if (timeout) clearTimeout(timeout)
            updatedView.dispatch(updatedView.state.tr)

            if (!state.selection.empty || state.doc.textContent.length < 5) return

            timeout = setTimeout(async () => {
              if (!updatedView.isDestroyed) {
                await fetchSuggestion(updatedView)
              }
            }, this.options.debounceMs)
          },
          destroy: () => {
            if (timeout) clearTimeout(timeout)
            abortController?.abort()
          },
        }),
      }),
    ]
  },
})
