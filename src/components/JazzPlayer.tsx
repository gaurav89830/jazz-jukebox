"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { background } from "@/config/player";
import { BackgroundPicture } from "@/components/BackgroundPicture";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TrackDial } from "@/components/TrackDial";
import { VinylRecord } from "@/components/VinylRecord";
import { usePlayerSettings, type PlayerSettings } from "@/hooks/usePlayerSettings";
import { useRecordPlayback } from "@/hooks/useRecordPlayback";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

type JazzPlayerContentProps = {
  settings: PlayerSettings;
  updateSetting: <K extends keyof PlayerSettings>(
    key: K,
    value: PlayerSettings[K],
  ) => void;
};

function JazzPlayerContent({ settings, updateSetting }: JazzPlayerContentProps) {
  const {
    audioRef,
    playing,
    rate,
    currentTrack,
    currentTrackIndex,
    tracks,
    elapsedSeconds,
    durationSeconds,
    toggleCenter,
    nextTrack,
    previousTrack,
    goToTrackIndex,
    beginSeekScrub,
    scrubTo,
    endSeekScrub,
    beginVinylScrub,
    scrubVinylBy,
    endVinylScrub,
  } = useRecordPlayback({
    volume: settings.volume,
    staticLevel: settings.staticLevel,
  });
  const seekBarRef = useRef<HTMLDivElement>(null);
  const lastScrubRef = useRef({ t: 0, seconds: 0 });
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState(0);
  const [dialVisible, setDialVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dialHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpDialActivity = useCallback(() => {
    if (dialHideTimerRef.current) {
      clearTimeout(dialHideTimerRef.current);
      dialHideTimerRef.current = null;
    }
    if (!settings.autohideJuke) return;
    dialHideTimerRef.current = setTimeout(() => {
      setDialVisible(false);
    }, 10000);
  }, [settings.autohideJuke]);

  const showDial = useCallback(() => {
    setDialVisible(true);
    bumpDialActivity();
  }, [bumpDialActivity]);

  const hideDial = useCallback(() => {
    if (dialHideTimerRef.current) {
      clearTimeout(dialHideTimerRef.current);
      dialHideTimerRef.current = null;
    }
    setDialVisible(false);
  }, []);

  const toggleDial = useCallback(() => {
    if (dialVisible) {
      hideDial();
    } else {
      showDial();
    }
  }, [dialVisible, hideDial, showDial]);

  useEffect(() => {
    if (dialVisible) bumpDialActivity();
  }, [bumpDialActivity, dialVisible, settings.autohideJuke]);

  useEffect(() => {
    return () => {
      if (dialHideTimerRef.current) {
        clearTimeout(dialHideTimerRef.current);
      }
    };
  }, []);

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
    beginSeekScrub();
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
      if (event.repeat) return;

      if (event.code === "Escape") {
        event.preventDefault();
        setSettingsOpen((open) => !open);
        return;
      }

      if (
        event.code === "KeyF" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void document.documentElement.requestFullscreen();
        }
        return;
      }

      if (settingsOpen) return;

      if (event.code === "Space") {
        event.preventDefault();
        void toggleCenter();
        return;
      }

      if (event.code === "ArrowLeft") {
        event.preventDefault();
        showDial();
        return;
      }

      if (event.code === "ArrowRight") {
        if (!dialVisible) return;
        event.preventDefault();
        hideDial();
        return;
      }

      if (event.code === "ArrowUp") {
        if (!dialVisible) return;
        event.preventDefault();
        bumpDialActivity();
        void previousTrack();
        return;
      }

      if (event.code === "ArrowDown") {
        if (!dialVisible) return;
        event.preventDefault();
        bumpDialActivity();
        void nextTrack();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [
    bumpDialActivity,
    dialVisible,
    hideDial,
    nextTrack,
    previousTrack,
    settingsOpen,
    showDial,
    toggleCenter,
  ]);

  const vinylOnLeft = settings.vinylDisplay === "left";
  const vinylOnRight = settings.vinylDisplay === "right";

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
      {settings.showBrand ? (
        <div
          className={`scene-brand ${
            dialVisible || settingsOpen ? "scene-brand--hidden" : ""
          }`}
          aria-hidden="true"
        >
          <span className="scene-brand__jazz">JAZZ</span>
          <span className="scene-brand__jukebox">JUKEBOX</span>
        </div>
      ) : null}

      <audio ref={audioRef} preload="auto" playsInline />

      <section
        className={`player-panel ${
          vinylOnLeft ? "" : "player-panel--no-vinyl"
        }`}
      >
        {vinylOnLeft ? (
          <div className="player-panel__vinyl">
            <VinylRecord
              className="player-panel__record"
              rate={rate}
              playing={playing}
              onToggle={() => void toggleCenter()}
              onScrubStart={beginVinylScrub}
              onScrub={scrubVinylBy}
              onScrubEnd={endVinylScrub}
            />
          </div>
        ) : null}
        <div className="player-panel__meta">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.22em] text-[#e4c995]">
            Now Playing
          </p>
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggleDial}
            className="player-panel__title mt-1.5 font-sans text-lg font-black leading-tight tracking-[-0.035em] text-[#f6ead6] sm:text-xl"
            aria-expanded={dialVisible}
            aria-label={`${currentTrack?.displayTitle ?? "Noir Jazz"} — toggle track list`}
          >
            {currentTrack?.displayTitle ?? "Noir Jazz"}
          </button>
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
              onClick={() => void toggleCenter()}
              className="track-skip-button"
              aria-label={playing ? "Pause" : "Play"}
              title={playing ? "Pause" : "Play"}
            >
              {playing ? "Ⅱ" : "▶"}
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

      {vinylOnRight ? (
        <div className="player-vinyl-float">
          <VinylRecord
            className="player-vinyl-float__record"
            rate={rate}
            playing={playing}
            onToggle={() => void toggleCenter()}
            onScrubStart={beginVinylScrub}
            onScrub={scrubVinylBy}
            onScrubEnd={endVinylScrub}
          />
        </div>
      ) : null}

      <TrackDial
        tracks={tracks}
        currentIndex={currentTrackIndex}
        playing={playing}
        visible={dialVisible}
        onActivity={bumpDialActivity}
        onSelectIndex={(index) => {
          bumpDialActivity();
          void goToTrackIndex(index);
        }}
      />

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={updateSetting}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

export function JazzPlayer() {
  const { settings, updateSetting, hydrated } = usePlayerSettings();

  if (!hydrated) {
    return <div className="player-scene min-h-dvh bg-[#140c07]" />;
  }

  return (
    <JazzPlayerContent settings={settings} updateSetting={updateSetting} />
  );
}
