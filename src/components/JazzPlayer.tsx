"use client";

import { useEffect } from "react";
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
  } = useRecordPlayback();
  const progress =
    durationSeconds > 0
      ? Math.min(100, Math.max(0, (elapsedSeconds / durationSeconds) * 100))
      : 0;

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

      <div className="absolute bottom-7 right-6 z-20 sm:bottom-10 sm:right-10">
        <VinylRecord
          rate={rate}
          playing={playing}
          onToggle={() => void toggleCenter()}
        />
      </div>

      <section className="absolute bottom-7 left-6 z-20 w-[min(72vw,44rem)] sm:bottom-10 sm:left-10">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#e4c995]">
          {currentTrack
            ? `Track ${currentTrack.number.toString().padStart(2, "0")}`
            : "Noir Jazz"}
        </p>
        <h1 className="mt-2 font-sans text-3xl font-black leading-[0.95] tracking-[-0.045em] text-[#f6ead6] sm:text-5xl">
          {currentTrack?.displayTitle ?? "Noir Jazz"}
        </h1>

        <div
          className="mt-5 h-px w-full overflow-hidden bg-[#f6ead6]/25"
          role="progressbar"
          aria-label="Track progress"
          aria-valuemin={0}
          aria-valuemax={durationSeconds}
          aria-valuenow={Math.min(elapsedSeconds, durationSeconds)}
        >
          <div
            className="h-full bg-[#f6ead6]/80 transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-3 flex items-center gap-3 text-[#f6ead6]">
          <button
            type="button"
            onClick={() => void previousTrack()}
            className="track-skip-button"
            aria-label="Previous track"
            title="Previous track"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => void nextTrack()}
            className="track-skip-button"
            aria-label="Next track"
            title="Next track"
          >
            →
          </button>
          <span className="ml-1 font-mono text-xs tracking-wide text-[#f6ead6]/75">
            {formatTime(elapsedSeconds)} / {formatTime(durationSeconds)}
          </span>
        </div>
      </section>
    </div>
  );
}
