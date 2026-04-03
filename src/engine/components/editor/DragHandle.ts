import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';
import { NodeSelection } from '@tiptap/pm/state';

/**
 * Adds a drag handle (grip icon) to the left of top-level blocks.
 * On hover, a handle appears. Dragging it initiates ProseMirror DnD to reorder blocks.
 */
export const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    let handle: HTMLDivElement | null = null;
    let currentBlockPos: number | null = null;

    function createHandle() {
      const el = document.createElement('div');
      el.className = 'editor-drag-handle';
      el.contentEditable = 'false';
      el.draggable = true;
      el.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/>
        <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
        <circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/>
      </svg>`;
      return el;
    }

    function getTopLevelBlockAtCoords(view: EditorView, y: number) {
      // Find position at coordinates
      const pos = view.posAtCoords({ left: view.dom.getBoundingClientRect().left + 10, top: y });
      if (!pos) return null;

      // Resolve to top-level block
      const resolved = view.state.doc.resolve(pos.pos);
      // Walk up to depth 1 (top-level inside doc)
      if (resolved.depth < 1) return null;
      const topPos = resolved.before(1);
      const node = view.state.doc.nodeAt(topPos);
      if (!node) return null;

      return { pos: topPos, node };
    }

    const plugin = new Plugin({
      key: new PluginKey('dragHandle'),
      view(view) {
        handle = createHandle();
        handle.style.display = 'none';
        view.dom.parentElement?.appendChild(handle);

        // Position handle on mousemove
        function onMouseMove(e: MouseEvent) {
          if (!handle) return;
          const editorRect = view.dom.getBoundingClientRect();

          // Only show when cursor is near the left edge of the editor
          if (e.clientX > editorRect.left + 60 || e.clientX < editorRect.left - 40) {
            handle.style.display = 'none';
            currentBlockPos = null;
            return;
          }

          const block = getTopLevelBlockAtCoords(view, e.clientY);
          if (!block) {
            handle.style.display = 'none';
            currentBlockPos = null;
            return;
          }

          currentBlockPos = block.pos;

          // Get block DOM position
          const domNode = view.nodeDOM(block.pos) as HTMLElement | null;
          if (!domNode) return;

          const blockRect = domNode.getBoundingClientRect();
          handle.style.display = 'flex';
          handle.style.top = `${blockRect.top - editorRect.top + view.dom.scrollTop + 2}px`;
          handle.style.left = '-28px';
        }

        function onMouseLeave() {
          if (handle) {
            // Delay hiding so user can reach the handle
            setTimeout(() => {
              if (handle && !handle.matches(':hover')) {
                handle.style.display = 'none';
                currentBlockPos = null;
              }
            }, 200);
          }
        }

        // Drag start — create a NodeSelection so ProseMirror handles the drop
        function onDragStart(e: DragEvent) {
          if (currentBlockPos == null) return;
          const node = view.state.doc.nodeAt(currentBlockPos);
          if (!node) return;

          // Create a node selection
          const selection = NodeSelection.create(view.state.doc, currentBlockPos);
          view.dispatch(view.state.tr.setSelection(selection));

          // Set transfer data so ProseMirror's built-in DnD handles the rest
          view.dragging = {
            slice: selection.content(),
            move: true,
          };

          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setDragImage(
              view.nodeDOM(currentBlockPos) as HTMLElement,
              0,
              0,
            );
          }
        }

        view.dom.addEventListener('mousemove', onMouseMove);
        view.dom.addEventListener('mouseleave', onMouseLeave);
        handle.addEventListener('dragstart', onDragStart);

        return {
          destroy() {
            view.dom.removeEventListener('mousemove', onMouseMove);
            view.dom.removeEventListener('mouseleave', onMouseLeave);
            if (handle) {
              handle.removeEventListener('dragstart', onDragStart);
              handle.remove();
              handle = null;
            }
          },
        };
      },
    });

    return [plugin];
  },
});
