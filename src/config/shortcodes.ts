import type { ShortcodeComponentMap } from '@/engine/components/ShortcodeRenderer';
import { CalloutBlock } from '@/engine/components/shortcodes/CalloutBlock';
import { CtaBlock } from '@/engine/components/shortcodes/CtaBlock';
import { YoutubeEmbed } from '@/engine/components/shortcodes/YoutubeEmbed';
import { GalleryBlock } from '@/engine/components/shortcodes/GalleryBlock';

/**
 * Project-level shortcode component registry.
 * To add a custom shortcode: import the component and add it here.
 */
export const SHORTCODE_COMPONENTS: ShortcodeComponentMap = {
  callout: CalloutBlock,
  cta: CtaBlock,
  youtube: YoutubeEmbed,
  gallery: GalleryBlock,
};
