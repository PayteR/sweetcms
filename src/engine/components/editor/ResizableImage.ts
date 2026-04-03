import Image from '@tiptap/extension-image';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Extends the default Image extension with click-to-select and drag-to-resize handles.
 * When an image is selected, a wrapper with corner handles is rendered via decorations.
 * Drag on any handle resizes the image proportionally.
 */
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute('width') || el.style.width || null,
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          return { width: attrs.width, style: `width: ${attrs.width}` };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? [];
    const editor = this.editor;

    const resizePlugin = new Plugin({
      key: new PluginKey('imageResize'),
      state: {
        init() {
          return { selectedImagePos: null as number | null };
        },
        apply(tr, value) {
          const meta = tr.getMeta('imageResize');
          if (meta !== undefined) return { selectedImagePos: meta };
          // Revalidate on doc changes — selection may have shifted
          if (tr.docChanged && value.selectedImagePos !== null) {
            const mapped = tr.mapping.map(value.selectedImagePos);
            const node = tr.doc.nodeAt(mapped);
            if (node?.type.name === 'image') return { selectedImagePos: mapped };
            return { selectedImagePos: null };
          }
          return value;
        },
      },
      props: {
        decorations(state) {
          const pluginState = resizePlugin.getState(state);
          if (pluginState?.selectedImagePos == null) return DecorationSet.empty;
          const pos = pluginState.selectedImagePos;
          const node = state.doc.nodeAt(pos);
          if (!node || node.type.name !== 'image') return DecorationSet.empty;

          const deco = Decoration.widget(pos, () => {
            // Invisible overlay to prevent losing the selection decoration
            // The actual resize UI is handled by the CSS class added via node decoration
            return document.createComment('');
          });

          const nodeDeco = Decoration.node(pos, pos + node.nodeSize, {
            class: 'image-resizable-selected',
          });

          return DecorationSet.create(state.doc, [deco, nodeDeco]);
        },
        handleClick(view, pos) {
          const node = view.state.doc.nodeAt(pos);
          if (node?.type.name === 'image') {
            view.dispatch(view.state.tr.setMeta('imageResize', pos));
            return true;
          }
          // Clicking elsewhere deselects
          const pluginState = resizePlugin.getState(view.state);
          if (pluginState?.selectedImagePos !== null) {
            view.dispatch(view.state.tr.setMeta('imageResize', null));
          }
          return false;
        },
        handleDOMEvents: {
          mousedown(view, event) {
            const target = event.target as HTMLElement;
            if (!target.classList?.contains('image-resize-handle')) return false;

            event.preventDefault();
            const pluginState = resizePlugin.getState(view.state);
            if (pluginState?.selectedImagePos == null) return false;

            const pos = pluginState.selectedImagePos;
            const node = view.state.doc.nodeAt(pos);
            if (!node) return false;

            // Find the image DOM element
            const domNode = view.nodeDOM(pos) as HTMLElement | null;
            const imgEl = domNode?.querySelector?.('img') ?? domNode;
            if (!imgEl) return false;

            const startX = event.clientX;
            const startWidth = imgEl.getBoundingClientRect().width;
            const direction = target.dataset.direction;

            function onMouseMove(e: MouseEvent) {
              const diff = direction === 'left' ? startX - e.clientX : e.clientX - startX;
              const newWidth = Math.max(100, Math.round(startWidth + diff));
              // Live resize via style
              (imgEl as HTMLElement).style.width = `${newWidth}px`;
            }

            function onMouseUp(e: MouseEvent) {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
              const diff = direction === 'left' ? startX - e.clientX : e.clientX - startX;
              const newWidth = Math.max(100, Math.round(startWidth + diff));
              // Commit to ProseMirror
              const currentNode = view.state.doc.nodeAt(pos);
            if (!currentNode) return;
            const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                ...currentNode.attrs,
                width: `${newWidth}px`,
              });
              view.dispatch(tr);
              editor.commands.focus();
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            return true;
          },
        },
      },
      view(editorView) {
        // Add resize handles to the DOM when image is selected
        function updateHandles() {
          // Remove existing handles
          editorView.dom.querySelectorAll('.image-resize-handle').forEach((el) => el.remove());

          const pluginState = resizePlugin.getState(editorView.state);
          if (pluginState?.selectedImagePos == null) return;

          const pos = pluginState.selectedImagePos;
          const domNode = editorView.nodeDOM(pos) as HTMLElement | null;
          if (!domNode) return;

          const wrapper = domNode.closest?.('.image-resizable-selected') ?? domNode;
          if (!wrapper || !(wrapper as HTMLElement).style) return;
          (wrapper as HTMLElement).style.position = 'relative';
          (wrapper as HTMLElement).style.display = 'inline-block';

          for (const dir of ['left', 'right'] as const) {
            const handle = document.createElement('div');
            handle.className = `image-resize-handle image-resize-handle-${dir}`;
            handle.dataset.direction = dir;
            handle.contentEditable = 'false';
            wrapper.appendChild(handle);
          }
        }

        return {
          update: updateHandles,
          destroy() {
            editorView.dom.querySelectorAll('.image-resize-handle').forEach((el) => el.remove());
          },
        };
      },
    });

    return [...parentPlugins, resizePlugin];
  },
});
