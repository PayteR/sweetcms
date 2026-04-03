'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Play } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ShortcodeRenderer } from '@/engine/components/ShortcodeRenderer';
import { SHORTCODE_COMPONENTS } from '@/config/shortcodes';

interface ShowcaseItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  cardType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  sortOrder: number;
}

interface Props {
  items: ShowcaseItem[];
}

function parseVideoEmbed(url: string): { provider: 'youtube' | 'vimeo' | 'unknown'; embedUrl: string } {
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&loop=1&playlist=${ytMatch[1]}` };
  }
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=1&loop=1` };
  }
  return { provider: 'unknown', embedUrl: url };
}

function CardOverlay({ title, description }: { title: string; description?: string }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-6 pb-8 pt-24 sm:px-10 sm:pb-12">
      <h2 className="text-2xl font-bold leading-tight text-white drop-shadow-lg sm:text-4xl">
        {title}
      </h2>
      {description && (
        <div className="mt-3 line-clamp-3 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
          <ShortcodeRenderer content={description} components={SHORTCODE_COMPONENTS} />
        </div>
      )}
    </div>
  );
}

function VideoCard({ item, isActive }: { item: ShowcaseItem; isActive: boolean }) {
  const video = item.mediaUrl ? parseVideoEmbed(item.mediaUrl) : null;

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      {isActive && video ? (
        <iframe
          src={video.embedUrl}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title={item.title}
        />
      ) : (
        <div className="relative flex h-full w-full items-center justify-center">
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
              alt={item.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-(--color-brand-900) to-(--color-accent-900)" />
          )}
          <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-md transition-transform hover:scale-110">
            <Play className="ml-1 h-10 w-10 text-white" fill="white" />
          </div>
        </div>
      )}
      <CardOverlay title={item.title} description={item.description} />
    </div>
  );
}

function ImageCard({ item }: { item: ShowcaseItem }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {item.mediaUrl ? (
        <img
          src={item.mediaUrl}
          alt={item.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-(--color-brand-800) to-(--color-accent-800)" />
      )}
      <div className="absolute inset-0 bg-black/25" />
      <CardOverlay title={item.title} description={item.description} />
    </div>
  );
}

function RichTextCard({ item }: { item: ShowcaseItem }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-(--color-brand-950) via-(--color-accent-950) to-(--color-brand-900) p-6">
      <div className="max-w-2xl text-center">
        <h2 className="text-3xl font-bold leading-tight text-white sm:text-5xl">
          {item.title}
        </h2>
        {item.description && (
          <div className="prose prose-invert mx-auto mt-6 max-w-none prose-p:text-white/80 prose-headings:text-white">
            <ShortcodeRenderer content={item.description} components={SHORTCODE_COMPONENTS} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ShowcaseFeed({ items }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const children = container.children;
    if (index >= 0 && index < children.length) {
      children[index]?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!isNaN(idx)) setCurrentIndex(idx);
          }
        }
      },
      { root: container, threshold: 0.6 }
    );

    for (const child of container.children) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToIndex(Math.min(currentIndex + 1, items.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToIndex(Math.max(currentIndex - 1, 0));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, items.length, scrollToIndex]);

  if (items.length === 0) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <p className="text-(--text-muted)">No showcase items yet.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="showcase-feed h-dvh snap-y snap-mandatory overflow-y-scroll"
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            data-index={index}
            className="h-dvh w-full snap-start snap-always"
          >
            {item.cardType === 'video' ? (
              <VideoCard item={item} isActive={index === currentIndex} />
            ) : item.cardType === 'image' ? (
              <ImageCard item={item} />
            ) : (
              <RichTextCard item={item} />
            )}
          </div>
        ))}
      </div>

      {/* Navigation */}
      {items.length > 1 && (
        <div className="fixed right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1.5 sm:right-6">
          <button
            onClick={() => scrollToIndex(Math.max(currentIndex - 1, 0))}
            disabled={currentIndex === 0}
            className="rounded-full bg-white/15 p-1.5 text-white backdrop-blur-md transition hover:bg-white/25 disabled:opacity-0"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToIndex(i)}
              className={cn(
                'rounded-full transition-all',
                i === currentIndex
                  ? 'h-2.5 w-2.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]'
                  : 'h-1.5 w-1.5 bg-white/40 hover:bg-white/70'
              )}
            />
          ))}
          <button
            onClick={() => scrollToIndex(Math.min(currentIndex + 1, items.length - 1))}
            disabled={currentIndex === items.length - 1}
            className="rounded-full bg-white/15 p-1.5 text-white backdrop-blur-md transition hover:bg-white/25 disabled:opacity-0"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
