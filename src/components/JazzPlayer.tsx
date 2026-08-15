"use client";

import { useEffect } from "react";
import { background } from "@/config/player";
import { BackgroundPicture } from "@/components/BackgroundPicture";
import { VinylRecord } from "@/components/VinylRecord";
import { useRecordPlayback } from "@/hooks/useRecordPlayback";

export function JazzPlayer() {
  const {
    audioRef,
    playing,
    rate,
    toggleCenter,
  } = useRecordPlayback();

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

      <audio ref={audioRef} loop preload="none" />

      <div className="absolute bottom-7 right-6 z-20 sm:bottom-10 sm:right-10">
        <VinylRecord
          rate={rate}
          playing={playing}
          onToggle={() => void toggleCenter()}
        />
      </div>

      <h1 className="absolute bottom-7 left-6 z-20 font-sans text-5xl font-black uppercase leading-none tracking-[-0.055em] text-[#f6ead6] sm:bottom-10 sm:left-10 sm:text-7xl">
        Noir Jazz
      </h1>
    </div>
  );
}
