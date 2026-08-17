"use client";

import type { Category, Track } from "@/config/player";

type DialEntry = {
  id: string;
  title: string;
};

type TrackDialProps = {
  tracks: Track[];
  currentIndex: number;
  visible: boolean;
  categories: Category[];
  categoriesVisible: boolean;
  focusedCategoryIndex: number;
  activeCategoryId: string;
  playingTrackId?: string;
  onActivity: () => void;
  onSelectTrack: (track: Track) => void;
  onFocusCategory: (index: number) => void;
};

const VISIBLE_RANGE = 9;
const SLOT_REM = 2.15;

function DialList({
  items,
  currentIndex,
  playingId,
  showPointer,
  onSelect,
}: {
  items: DialEntry[];
  currentIndex: number;
  playingId?: string;
  showPointer?: boolean;
  onSelect: (index: number) => void;
}) {
  if (currentIndex < 0 || items.length === 0) return null;

  const visibleItems = items
    .map((item, index) => ({
      item,
      index,
      offset: index - currentIndex,
    }))
    .filter(({ offset }) => Math.abs(offset) <= VISIBLE_RANGE);

  return (
    <div className="track-dial__list">
      {visibleItems.map(({ item, index, offset }) => {
        const distance = Math.abs(offset);
        const isActive = offset === 0;
        const isPlaying = playingId === item.id;
        const isEmphasized = isActive && Boolean(showPointer);
        const faded = distance >= VISIBLE_RANGE - 1;

        return (
          <button
            key={item.id}
            type="button"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(index)}
            className={`track-dial__item ${isActive ? "track-dial__item--active" : ""} ${
              isPlaying ? "track-dial__item--playing" : ""
            } ${isEmphasized ? "track-dial__item--emphasis" : ""}`}
            style={{
              transform: `translateY(calc(-50% + ${offset * SLOT_REM}rem)) scale(${isEmphasized ? 1 : 0.96})`,
              opacity: faded ? 0 : Math.max(0.34, 1 - distance * 0.08),
              zIndex: 10 - distance,
            }}
            aria-label={item.title}
            aria-current={isActive ? "true" : undefined}
          >
            {isActive && showPointer ? (
              <span className="track-dial__pointer" aria-hidden="true" />
            ) : null}
            <span className="track-dial__title">{item.title}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TrackDial({
  tracks,
  currentIndex,
  visible,
  categories,
  categoriesVisible,
  focusedCategoryIndex,
  activeCategoryId,
  playingTrackId,
  onActivity,
  onSelectTrack,
  onFocusCategory,
}: TrackDialProps) {
  if (tracks.length === 0) return null;

  const focusedIndex = currentIndex >= 0 ? currentIndex : 0;

  return (
    <aside
      className={`track-dial ${visible ? "track-dial--visible" : ""} ${
        categoriesVisible ? "track-dial--browse" : ""
      }`}
      aria-label="Track selector"
      aria-hidden={!visible}
      onPointerMove={visible ? onActivity : undefined}
    >
      <div className="track-dial__glass" aria-hidden="true" />

      <div className="track-dial__columns">
        <div className="track-dial__categories" aria-hidden={!categoriesVisible}>
          <p className="track-dial__brand">
            <span className="track-dial__brand-jazz">THE</span>
            <span className="track-dial__brand-jukebox">SETS</span>
          </p>
          <DialList
            items={categories.map((category) => ({
              id: category.id,
              title: category.title,
            }))}
            currentIndex={focusedCategoryIndex}
            playingId={activeCategoryId}
            showPointer={categoriesVisible}
            onSelect={(index) => {
              onActivity();
              onFocusCategory(index);
            }}
          />
        </div>

        <div className="track-dial__panel">
          <p className="track-dial__brand">
            <span className="track-dial__brand-jazz">JAZZ</span>
            <span className="track-dial__brand-jukebox">JUKEBOX</span>
          </p>
          <DialList
            items={tracks.map((track) => ({
              id: track.id,
              title: track.displayTitle,
            }))}
            currentIndex={focusedIndex}
            playingId={playingTrackId}
            showPointer={!categoriesVisible}
            onSelect={(index) => {
              onActivity();
              const track = tracks[index];
              if (track) onSelectTrack(track);
            }}
          />
        </div>
      </div>

      <p className="track-dial__hint" aria-hidden="true">
        {categoriesVisible ? "↑ ↓ · →" : "← · ↑ ↓ · →"}
      </p>
    </aside>
  );
}
