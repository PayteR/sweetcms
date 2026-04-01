'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Code2,
  Minus,
  Blocks,
  FileSearch,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useBlankTranslations } from '@/lib/translations';
import { htmlToMarkdown, markdownToHtml } from '@/engine/lib/markdown';
import { toast } from '@/store/toast-store';
import type { EditorHandle } from '@/engine/hooks/useLinkPicker';
import type { ShortcodeConfig } from '@/engine/types/shortcodes';

interface Props {
  content: string;
  onChange: (value: string) => void;
  placeholder?: string;
  postId?: string;
  height?: string;
  storageKey?: string;
  onRequestLinkPicker?: () => void;
  editorRef?: React.RefObject<EditorHandle | null>;
  /** Optional shortcode integration (dropdown, Tiptap extension, transforms) */
  shortcodes?: ShortcodeConfig;
}

const HEIGHT_STORAGE_PREFIX = 'cms-editor-h:';

async function uploadImage(file: File, postId?: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  if (postId) formData.append('postId', postId);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'Upload failed');
  }
  const data = await res.json() as { url: string };
  return data.url;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'rounded p-1.5 transition-colors',
        active
          ? 'bg-(--color-brand-50) dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] text-(--color-brand-700) dark:text-(--color-brand-400)'
          : 'text-(--text-secondary) hover:bg-(--surface-secondary) hover:text-(--text-primary)',
        disabled && 'cursor-not-allowed opacity-30'
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-6 w-px bg-(--border-primary)" />;
}

const identity = (html: string) => html;

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  postId,
  height,
  storageKey,
  onRequestLinkPicker,
  editorRef,
  shortcodes,
}: Props) {
  const scPrepareRef = useRef(shortcodes?.prepareForEditor ?? identity);
  const scSerializeRef = useRef(shortcodes?.serializeForStorage ?? identity);
  useEffect(() => {
    scPrepareRef.current = shortcodes?.prepareForEditor ?? identity;
    scSerializeRef.current = shortcodes?.serializeForStorage ?? identity;
  });
  const __ = useBlankTranslations();
  const [shortcodeMenuOpen, setShortcodeMenuOpen] = useState(false);
  const [mode, setMode] = useState<'wysiwyg' | 'source'>(() => {
    try {
      return localStorage.getItem('cms-editor-mode') === 'source'
        ? 'source'
        : 'wysiwyg';
    } catch {
      return 'wysiwyg';
    }
  });
  const [sourceValue, setSourceValue] = useState(content);
  const lastEmittedContent = useRef(content);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Clear pending debounce on unmount (editor may already be destroyed)
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  // Height persistence
  useEffect(() => {
    if (!storageKey) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const savedHeight = localStorage.getItem(HEIGHT_STORAGE_PREFIX + storageKey);
    if (savedHeight) wrapper.style.height = savedHeight;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.round(entry.contentRect.height);
        if (h > 0) localStorage.setItem(HEIGHT_STORAGE_PREFIX + storageKey, `${h}px`);
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [storageKey]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'rounded-lg max-w-full' },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: placeholder ?? __('Start writing...'),
      }),
      ...(shortcodes?.extension ? [shortcodes.extension] : []),
    ],
    content: scPrepareRef.current(markdownToHtml(content)),
    onUpdate: ({ editor: e }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const md = htmlToMarkdown(scSerializeRef.current(e.getHTML()));
        lastEmittedContent.current = md;
        onChangeRef.current(md);
      }, 300);
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-4 py-3',
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              uploadImage(file, postId).then((url) => {
                editor?.chain().focus().setImage({ src: url }).run();
              }).catch((err: unknown) => {
                toast.error(err instanceof Error ? err.message : __('Image upload failed'));
              });
            }
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = (event as DragEvent).dataTransfer?.files;
        if (!files?.length) return false;
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            uploadImage(file, postId).then((url) => {
              editor?.chain().focus().setImage({ src: url }).run();
            }).catch((err: unknown) => {
              toast.error(err instanceof Error ? err.message : __('Image upload failed'));
            });
            return true;
          }
        }
        return false;
      },
    },
  });

  // Sync content from parent when it changes externally (e.g. autosave restore)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (content === lastEmittedContent.current) return;
    lastEmittedContent.current = content;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate external sync: parent content → source textarea
    if (mode === 'source') setSourceValue(content);
    editor.commands.setContent(scPrepareRef.current(markdownToHtml(content)), {
      emitUpdate: false,
    });
  }, [editor, content, mode]);

  // EditorHandle — expose replaceSelection to parent via editorRef
  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      replaceSelection: (text: string) => {
        if (mode === 'source') {
          const textarea = sourceTextareaRef.current;
          if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const val = textarea.value;
            const newValue = val.slice(0, start) + text + val.slice(end);
            setSourceValue(newValue);
            onChangeRef.current(newValue);
            requestAnimationFrame(() => {
              textarea.selectionStart = textarea.selectionEnd = start + text.length;
              textarea.focus();
            });
          }
        } else if (editor) {
          const linkMatch = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (linkMatch) {
            const [, title, url] = linkMatch;
            editor.chain().focus().insertContent({
              type: 'text',
              marks: [{ type: 'link', attrs: { href: url } }],
              text: title,
            }).run();
          } else {
            editor.chain().focus().insertContent(text).run();
          }
        }
      },
    };
    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editor, editorRef, mode]);

  const toggleMode = useCallback(() => {
    if (!editor) return;
    if (mode === 'wysiwyg') {
      // Flush any pending debounced update before reading HTML
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const md = htmlToMarkdown(scSerializeRef.current(editor.getHTML()));
      setSourceValue(md);
      lastEmittedContent.current = md;
      onChangeRef.current(md);
      setMode('source');
      try { localStorage.setItem('cms-editor-mode', 'source'); } catch { /* quota */ }
    } else {
      // Source → WYSIWYG: suppress emitUpdate to avoid double-fire
      editor.commands.setContent(scPrepareRef.current(markdownToHtml(sourceValue)), {
        emitUpdate: false,
      });
      const md = htmlToMarkdown(scSerializeRef.current(editor.getHTML()));
      lastEmittedContent.current = md;
      onChangeRef.current(md);
      setMode('wysiwyg');
      try { localStorage.setItem('cms-editor-mode', 'wysiwyg'); } catch { /* quota */ }
    }
  }, [editor, mode, sourceValue]);

  if (!editor) return null;

  function addLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt(__('URL'), previousUrl ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  const iconSize = 'h-4 w-4';

  return (
    <div
      ref={wrapperRef}
      style={{ height: height ?? '400px', resize: 'vertical', overflow: 'hidden' }}
      className="flex flex-col overflow-hidden rounded-md border border-(--border-primary) focus-within:border-(--color-accent-500) focus-within:ring-1 focus-within:ring-(--color-accent-500)"
    >
      {/* Toolbar — disabled in source mode to prevent modifying the hidden editor */}
      <div className={cn(
        'editor-toolbar flex flex-wrap items-center gap-0.5 border-b border-(--border-primary) px-2 py-1.5 shrink-0',
        mode === 'source' && 'pointer-events-none opacity-40',
      )}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title={__('Bold')}
        >
          <Bold className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title={__('Italic')}
        >
          <Italic className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title={__('Underline')}
        >
          <UnderlineIcon className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title={__('Strikethrough')}
        >
          <Strikethrough className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive('code')}
          title={__('Inline Code')}
        >
          <Code className={iconSize} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title={__('Heading 1')}
        >
          <Heading1 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title={__('Heading 2')}
        >
          <Heading2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title={__('Heading 3')}
        >
          <Heading3 className={iconSize} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title={__('Bullet List')}
        >
          <List className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title={__('Ordered List')}
        >
          <ListOrdered className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title={__('Quote')}
        >
          <Quote className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          title={__('Code Block')}
        >
          <Code2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title={__('Horizontal Rule')}
        >
          <Minus className={iconSize} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
          title={__('Align Left')}
        >
          <AlignLeft className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
          title={__('Align Center')}
        >
          <AlignCenter className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
          title={__('Align Right')}
        >
          <AlignRight className={iconSize} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={addLink}
          active={editor.isActive('link')}
          title={__('Link')}
        >
          <LinkIcon className={iconSize} />
        </ToolbarButton>
        {onRequestLinkPicker && (
          <ToolbarButton onClick={onRequestLinkPicker} title={__('Internal Link')} active={false}>
            <FileSearch size={18} />
          </ToolbarButton>
        )}
        <ToolbarButton onClick={() => imageInputRef.current?.click()} title={__('Image')}>
          <ImageIcon className={iconSize} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Shortcode insert dropdown (only shown when shortcodes config provided) */}
        {shortcodes && shortcodes.registry.length > 0 && (
          <>
            <div className="editor-toolbar-menu relative">
              <ToolbarButton
                onClick={() => setShortcodeMenuOpen(!shortcodeMenuOpen)}
                title={__('Insert Block')}
              >
                <Blocks className={iconSize} />
              </ToolbarButton>
              {shortcodeMenuOpen && (
                <div className="editor-shortcode-menu absolute left-0 top-full z-10 mt-1 w-40 rounded-md border border-(--border-primary) bg-(--surface-primary) py-1 shadow-lg">
                  {shortcodes.registry.map((sc) => (
                    <button
                      key={sc.name}
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-sm text-(--text-secondary) hover:bg-(--surface-secondary)"
                      onClick={() => {
                        if (!editor) return;
                        const defaultAttrs: Record<string, string> = {};
                        for (const attr of sc.attrs) {
                          if (attr.default) defaultAttrs[attr.name] = attr.default;
                        }
                        editor
                          .chain()
                          .focus()
                          .insertContent({
                            type: 'shortcode',
                            attrs: {
                              shortcodeName: sc.name,
                              shortcodeAttrs: JSON.stringify(defaultAttrs),
                              shortcodeContent: '',
                            },
                          })
                          .run();
                        setShortcodeMenuOpen(false);
                      }}
                    >
                      {__(sc.label)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ToolbarDivider />
          </>
        )}

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title={__('Undo')}
        >
          <Undo className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title={__('Redo')}
        >
          <Redo className={iconSize} />
        </ToolbarButton>

      </div>

      {/* Hidden file input for image upload */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || !editor) return;
          e.target.value = '';
          try {
            const url = await uploadImage(file, postId);
            editor.chain().focus().setImage({ src: url }).run();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : __('Image upload failed'));
          }
        }}
      />

      {/* Editor / Source */}
      <div className="editor-content flex-1 overflow-auto">
        {mode === 'wysiwyg' ? (
          <EditorContent
            editor={editor}
            className="h-full"
          />
        ) : (
          <textarea
            ref={sourceTextareaRef}
            value={sourceValue}
            onChange={(e) => {
              setSourceValue(e.target.value);
              lastEmittedContent.current = e.target.value;
              onChangeRef.current(e.target.value);
            }}
            className="tiptap-source-textarea h-full min-h-[300px] w-full resize-none border-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-inherit outline-none"
            style={{ tabSize: 2 }}
          />
        )}
      </div>

      {/* Mode tabs (bottom) */}
      <div className="editor-mode-tabs flex justify-end border-t border-(--border-primary) shrink-0">
        <button
          type="button"
          className={cn(
            '-mt-px border-t-2 px-4 py-1.5 text-[13px] transition-colors',
            mode === 'wysiwyg'
              ? 'border-(--color-brand-500) text-(--color-brand-500) dark:border-(--color-brand-400) dark:text-(--color-brand-400) bg-(--surface-primary)'
              : 'border-transparent text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-primary)',
          )}
          onClick={() => mode !== 'wysiwyg' && toggleMode()}
        >
          {__('Visual')}
        </button>
        <button
          type="button"
          className={cn(
            '-mt-px border-t-2 px-4 py-1.5 text-[13px] transition-colors',
            mode === 'source'
              ? 'border-(--color-brand-500) text-(--color-brand-500) dark:border-(--color-brand-400) dark:text-(--color-brand-400) bg-(--surface-primary)'
              : 'border-transparent text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-primary)',
          )}
          onClick={() => mode !== 'source' && toggleMode()}
        >
          {__('Source')}
        </button>
      </div>
    </div>
  );
}
