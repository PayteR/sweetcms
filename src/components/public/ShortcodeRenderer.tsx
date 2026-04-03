'use client';

import { parseShortcodes } from '@/engine/lib/shortcodes-parser';
import { markdownToHtml } from '@/engine/lib/markdown';
import { CalloutBlock } from './shortcodes/CalloutBlock';
import { CtaBlock } from './shortcodes/CtaBlock';
import { YoutubeEmbed } from './shortcodes/YoutubeEmbed';
import { GalleryBlock } from './shortcodes/GalleryBlock';

const SHORTCODE_COMPONENTS: Record<
  string,
  React.ComponentType<{ attrs: Record<string, string>; content?: string }>
> = {
  callout: CalloutBlock,
  cta: CtaBlock,
  youtube: YoutubeEmbed,
  gallery: GalleryBlock,
};

interface Props {
  content: string;
}

export function ShortcodeRenderer({ content }: Props) {
  const html = markdownToHtml(content);
  const segments = parseShortcodes(html);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'html') {
          return (
            <div
              key={i}
              dangerouslySetInnerHTML={{ __html: seg.content }}
            />
          );
        }

        const Component = SHORTCODE_COMPONENTS[seg.name];
        if (!Component) {
          // Unknown shortcode — render raw
          return (
            <div key={i} className="my-2 rounded bg-(--surface-secondary) p-3 text-sm text-(--text-muted)">
              [{seg.name}] (unsupported shortcode)
            </div>
          );
        }

        return <Component key={i} attrs={seg.attrs} content={seg.content} />;
      })}
    </>
  );
}
