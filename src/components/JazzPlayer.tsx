"use client";

import { useEffect, useRef, useState } from "react";
import { background } from "@/config/player";
import { BackgroundPicture } from "@/components/BackgroundPicture";
import { VinylRecord } from "@/components/VinylRecord";
import { useRecordPlayback } from "@/hooks/useRecordPlayback";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function JazzPlayer() {
  const {
    audioRef,
    playing,
    rate,
    currentTrack,
    elapsedSeconds,
    durationSeconds,
    toggleCenter,
    nextTrack,
    previousTrack,
    beginSeekScrub,
    scrubTo,
    endSeekScrub,
  } = useRecordPlayback();
  const seekBarRef = useRef<HTMLDivElement>(null);
  const lastScrubRef = useRef({ t: 0, seconds: 0 });
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState(0);

  const displayedSeconds = isSeeking ? seekPreviewSeconds : elapsedSeconds;
  const progress =
    durationSeconds > 0
      ? Math.min(
          100,
          Math.max(0, (displayedSeconds / durationSeconds) * 100),
        )
      : 0;

  const getSeekSeconds = (clientX: number) => {
    const bar = seekBarRef.current;
    if (!bar || durationSeconds <= 0) return 0;
    const { left, width } = bar.getBoundingClientRect();
    if (width <= 0) return 0;
    const fraction = Math.max(0, Math.min(1, (clientX - left) / width));
    return fraction * durationSeconds;
  };

  const handleSeekPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (durationSeconds <= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const seconds = getSeekSeconds(event.clientX);
    setIsSeeking(true);
    setSeekPreviewSeconds(seconds);
    lastScrubRef.current = { t: performance.now(), seconds };
    void beginSeekScrub();
    scrubTo(seconds, 0);
  };

  const handleSeekPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeeking || durationSeconds <= 0) return;
    const seconds = getSeekSeconds(event.clientX);
    const now = performance.now();
    const elapsed = (now - lastScrubRef.current.t) / 1000;
    const scrubSpeed =
      elapsed > 0
        ? (seconds - lastScrubRef.current.seconds) / elapsed
        : 0;
    lastScrubRef.current = { t: now, seconds };
    setSeekPreviewSeconds(seconds);
    scrubTo(seconds, scrubSpeed);
  };

  const finishSeek = (clientX: number) => {
    if (durationSeconds <= 0) return;
    const seconds = getSeekSeconds(clientX);
    setIsSeeking(false);
    endSeekScrub(seconds);
  };

  const handleSeekPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeeking) return;
    finishSeek(event.clientX);
  };

  const handleSeekLostPointerCapture = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isSeeking) return;
    finishSeek(event.clientX);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      event.preventDefault();
      void toggleCenter();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [toggleCenter]);

  return (
    <div
      className={`player-scene relative min-h-dvh overflow-hidden text-[#f6ead6] ${
        playing ? "" : "player-scene--paused"
      }`}
    >
      <div className="absolute inset-0">
        <BackgroundPicture background={background} priority />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-black/40 via-transparent to-black/30" />
      <div
        className={`pause-vignette pointer-events-none absolute inset-0 ${
          playing ? "" : "pause-vignette--visible"
        }`}
      />

      <audio ref={audioRef} preload="none" />

      <section className="player-panel absolute bottom-7 left-6 z-20 sm:bottom-10 sm:left-10">
        <div className="player-panel__vinyl">
          <VinylRecord
            className="player-panel__record"
            rate={rate}
            playing={playing}
            onToggle={() => void toggleCenter()}
          />
        </div>
        <div className="player-panel__meta">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[#e4c995]">
            Now Playing
          </p>
          <h1 className="mt-1.5 font-sans text-lg font-black leading-tight tracking-[-0.035em] text-[#f6ead6] sm:text-xl">
            {currentTrack?.displayTitle ?? "Noir Jazz"}
          </h1>
        </div>

        <div
          ref={seekBarRef}
          className={`player-panel__seek seek-bar-hit ${isSeeking ? "seek-bar-hit--seeking" : ""}`}
          role="slider"
          tabIndex={-1}
          aria-label="Track progress"
          aria-valuemin={0}
          aria-valuemax={durationSeconds}
          aria-valuenow={Math.min(displayedSeconds, durationSeconds)}
          onPointerDown={handleSeekPointerDown}
          onPointerMove={handleSeekPointerMove}
          onPointerUp={handleSeekPointerUp}
          onLostPointerCapture={handleSeekLostPointerCapture}
        >
          <div className="seek-bar">
            <div className="seek-bar__glow" aria-hidden="true" />
            <div
              className="seek-bar__track"
              style={{ width: `${progress}%` }}
            />
            <div
              className="seek-bar__thumb"
              style={{ left: `${progress}%` }}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="player-panel__controls flex items-end justify-between text-[#f6ead6]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void previousTrack()}
              className="track-skip-button"
              aria-label="Previous track"
              title="Previous track"
            >
              ←
            </button>
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void nextTrack()}
              className="track-skip-button"
              aria-label="Next track"
              title="Next track"
            >
              →
            </button>
          </div>
          <span className="track-time">
            {formatTime(displayedSeconds)} / {formatTime(durationSeconds)}
          </span>
        </div>
      </section>
    </div>
  );
}
