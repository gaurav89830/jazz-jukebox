"use client";

import type { Track } from "@/config/player";

type TrackDialProps = {
  tracks: Track[];
  currentIndex: number;
  playing: boolean;
  visible: boolean;
  onActivity: () => void;
  onSelectIndex: (index: number) => void;
};

const VISIBLE_RANGE = 9;
const SLOT_REM = 2.15;

function wrapOffset(index: number, currentIndex: number, length: number) {
  let offset = index - currentIndex;
  const half = length / 2;
  if (offset > half) offset -= length;
  if (offset < -half) offset += length;
  return offset;
}

export function TrackDial({
  tracks,
  currentIndex,
  visible,
  onActivity,
  onSelectIndex,
}: TrackDialProps) {
  if (currentIndex < 0 || tracks.length === 0) return null;

  const visibleTracks = tracks
    .map((track, index) => ({
      track,
      index,
      offset: wrapOffset(index, currentIndex, tracks.length),
    }))
    .filter(({ offset }) => Math.abs(offset) <= VISIBLE_RANGE);

  return (
    <aside
      className={`track-dial ${visible ? "track-dial--visible" : ""}`}
      aria-label="Track selector"
      aria-hidden={!visible}
      onPointerMove={visible ? onActivity : undefined}
    >
      <div className="track-dial__glass" aria-hidden="true" />

      <div className="track-dial__panel">
        <p className="track-dial__brand">
          <span>JAZZ</span>
          <span>JUKEBOX</span>
        </p>
        <div className="track-dial__list">
        {visibleTracks.map(({ track, index, offset }) => {
          const distance = Math.abs(offset);
          const isActive = offset === 0;
          const faded = distance >= VISIBLE_RANGE - 1;

          return (
            <button
              key={track.id}
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onActivity();
                if (!isActive) onSelectIndex(index);
              }}
              className={`track-dial__item ${isActive ? "track-dial__item--active" : ""}`}
              style={{
                transform: `translateY(calc(-50% + ${offset * SLOT_REM}rem)) scale(${isActive ? 1 : 0.96})`,
                opacity: faded ? 0 : Math.max(0.34, 1 - distance * 0.08),
                zIndex: 10 - distance,
              }}
              aria-label={`${isActive ? "Now playing: " : "Play "}${track.displayTitle}`}
              aria-current={isActive ? "true" : undefined}
            >
              <span className="track-dial__title">{track.displayTitle}</span>
            </button>
          );
        })}
        </div>
      </div>

      <p className="track-dial__hint" aria-hidden="true">
        ↑ ↓ · →
      </p>
    </aside>
  );
}
