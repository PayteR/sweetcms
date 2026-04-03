'use client';

import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu';
import type { SlashCommandItem } from './slash-commands';

interface SuggestionProps {
  editor: { view: { dom: HTMLElement } };
  clientRect: (() => DOMRect | null) | null;
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

/**
 * Creates the Tiptap suggestion render function for the slash command menu.
 * Returns a function compatible with `suggestion.render` in the extension options.
 */
export function createSlashCommandRender() {
  return () => {
    let component: ReactRenderer<SlashCommandMenuHandle> | null = null;
    let popup: TippyInstance | null = null;

    return {
      onStart(props: SuggestionProps) {
        component = new ReactRenderer(SlashCommandMenu, {
          props: {
            items: props.items,
            command: props.command,
          },
          editor: props.editor as never,
        });

        const [instance] = tippy('body', {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          offset: [0, 4],
        });
        popup = instance ?? null;
      },

      onUpdate(props: SuggestionProps) {
        component?.updateProps({
          items: props.items,
          command: props.command,
        });

        if (props.clientRect && popup) {
          popup.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        }
      },

      onKeyDown(props: { event: KeyboardEvent }) {
        if (props.event.key === 'Escape') {
          popup?.hide();
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit() {
        popup?.destroy();
        component?.destroy();
        popup = null;
        component = null;
      },
    };
  };
}
