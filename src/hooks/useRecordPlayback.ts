"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTrackUrl,
  tracks,
  type Track,
} from "@/config/player";
import { prefetchAudio } from "@/lib/prefetch-audio";

const MIN_RATE = 0.08;

function easeOut(t: number) {
  return 1 - (1 - t) ** 3;
}

function setPitchFollowsSpeed(audio: HTMLAudioElement) {
  audio.preservesPitch = false;
  (
    audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }
  ).webkitPreservesPitch = false;
}

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createCrackle(ctx: AudioContext) {
  const buffer = noiseBuffer(ctx, 3);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] *= 0.018;
    if (Math.random() < 0.0015) data[i] += (Math.random() * 2 - 1) * 0.5;
  }

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.loop = true;
  filter.type = "highpass";
  filter.frequency.value = 1100;
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
  return gain;
}

type ScrubBus = {
  gain: GainNode;
  filter: BiquadFilterNode;
};

function createScrubBus(ctx: AudioContext): ScrubBus {
  const buffer = noiseBuffer(ctx, 2.5);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] *= 0.014;
    if (Math.random() < 0.0025) {
      data[i] += (Math.random() * 2 - 1) * 0.22;
    }
  }

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.loop = true;
  filter.type = "bandpass";
  filter.frequency.value = 2400;
  filter.Q.value = 0.85;
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
  return { gain, filter };
}

function resolveDuration(audio: HTMLAudioElement, catalogDuration: number) {
  return Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : catalogDuration;
}

const CRACKLE_BASE = 0.0192;

type RecordPlaybackOptions = {
  volume: number;
  staticLevel: number;
};

export function useRecordPlayback({
  volume,
  staticLevel,
}: RecordPlaybackOptions) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const crackleRef = useRef<GainNode | null>(null);
  const scrubRef = useRef<ScrubBus | null>(null);
  const scrubbingRef = useRef(false);
  const rateRef = useRef(0);
  const staticLevelRef = useRef(staticLevel);
  const runningRef = useRef(false);
  const selectedTrackRef = useRef<Track | null>(null);
  const rampTokenRef = useRef(0);
  const awaitingGestureRef = useRef(false);
  const [rate, setRate] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const selectTrack = useCallback((selected: Track) => {
    selectedTrackRef.current = selected;
    setCurrentTrack(selected);
    setElapsedSeconds(0);
    prefetchAudio(getTrackUrl(selected));
    return selected;
  }, []);

  const chooseRandomTrack = useCallback(() => {
    if (selectedTrackRef.current) return selectedTrackRef.current;

    const selected = tracks[Math.floor(Math.random() * tracks.length)];
    return selectTrack(selected);
  }, [selectTrack]);

  const muteAuxAudio = useCallback(() => {
    const ctx = contextRef.current;
    if (!ctx || ctx.state === "closed") return;

    const now = ctx.currentTime;
    if (crackleRef.current) {
      crackleRef.current.gain.cancelScheduledValues(now);
      crackleRef.current.gain.setValueAtTime(0, now);
    }
    if (scrubRef.current) {
      scrubRef.current.gain.gain.cancelScheduledValues(now);
      scrubRef.current.gain.gain.setValueAtTime(0, now);
    }
  }, []);

  const setSpeed = useCallback((speed: number) => {
    const next = Math.max(0, Math.min(1, speed));
    rateRef.current = next;
    setRate(next);

    const audio = audioRef.current;
    if (audio) audio.playbackRate = Math.max(MIN_RATE, next);

    const ctx = contextRef.current;
    if (ctx && ctx.state !== "closed" && crackleRef.current) {
      const crackleGain = runningRef.current
        ? next * CRACKLE_BASE * staticLevelRef.current
        : 0;
      crackleRef.current.gain.setTargetAtTime(crackleGain, ctx.currentTime, 0.04);
    }
  }, []);

  const markAwaitingGesture = useCallback(() => {
    awaitingGestureRef.current = true;
    runningRef.current = false;
    setPlaying(false);
    muteAuxAudio();
    setSpeed(0);
  }, [muteAuxAudio, setSpeed]);

  const clearAwaitingGesture = useCallback(() => {
    awaitingGestureRef.current = false;
  }, []);

  const isAudioActive = useCallback((audio: HTMLAudioElement) => {
    return !audio.paused && !audio.ended;
  }, []);

  useEffect(() => {
    staticLevelRef.current = staticLevel;
    if (!runningRef.current) return;

    const ctx = contextRef.current;
    if (ctx && ctx.state !== "closed" && crackleRef.current) {
      crackleRef.current.gain.setTargetAtTime(
        rateRef.current * CRACKLE_BASE * staticLevel,
        ctx.currentTime,
        0.05,
      );
    }
  }, [staticLevel]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  const rampTo = useCallback(
    (target: number, duration: number) => {
      const token = ++rampTokenRef.current;
      const start = rateRef.current;
      const started = performance.now();

      return new Promise<boolean>((resolve) => {
        let animationFrame = 0;
        let timer = 0;
        let stepPending = false;

        const scheduleStep = () => {
          stepPending = true;
          animationFrame = requestAnimationFrame(step);
          timer = window.setTimeout(() => step(performance.now()), 50);
        };

        const step = (now: number) => {
          if (!stepPending) return;
          stepPending = false;
          cancelAnimationFrame(animationFrame);
          window.clearTimeout(timer);

          if (token !== rampTokenRef.current) {
            resolve(false);
            return;
          }
          const progress = Math.min(1, (now - started) / duration);
          setSpeed(start + (target - start) * easeOut(progress));
          if (progress < 1) {
            scheduleStep();
          } else {
            resolve(true);
          }
        };

        scheduleStep();
      });
    },
    [setSpeed],
  );

  const ensureAudioContext = useCallback(() => {
    const existing = contextRef.current;
    if (existing && existing.state !== "closed") return existing;

    const ctx = new AudioContext();
    contextRef.current = ctx;
    crackleRef.current = createCrackle(ctx);
    scrubRef.current = createScrubBus(ctx);
    return ctx;
  }, []);

  const engageFromGesture = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return false;

    if (!audio.hasAttribute("src")) {
      audio.src = getTrackUrl(chooseRandomTrack());
    }
    setPitchFollowsSpeed(audio);

    const ctx = ensureAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    return true;
  }, [chooseRandomTrack, ensureAudioContext]);

  const prepare = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;

    if (!audio.hasAttribute("src")) {
      audio.src = getTrackUrl(chooseRandomTrack());
    }
    setPitchFollowsSpeed(audio);

    const ctx = ensureAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return true;
  }, [chooseRandomTrack, ensureAudioContext]);

  const playFromGesture = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !engageFromGesture()) {
      return Promise.resolve(false);
    }

    ++rampTokenRef.current;
    setSpeed(Math.max(MIN_RATE, rateRef.current));

    return audio
      .play()
      .then(() => {
        runningRef.current = true;
        setPlaying(true);
        clearAwaitingGesture();
        return rampTo(1, 1100);
      })
      .then(() => true)
      .catch(() => {
        markAwaitingGesture();
        return false;
      });
  }, [
    clearAwaitingGesture,
    engageFromGesture,
    markAwaitingGesture,
    rampTo,
    setSpeed,
  ]);

  const start = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !(await prepare())) {
      markAwaitingGesture();
      return false;
    }

    ++rampTokenRef.current;
    setSpeed(Math.max(MIN_RATE, rateRef.current));
    try {
      await audio.play();
      runningRef.current = true;
      setPlaying(true);
      clearAwaitingGesture();
      await rampTo(1, 1100);
      return isAudioActive(audio);
    } catch {
      markAwaitingGesture();
      return false;
    }
  }, [
    clearAwaitingGesture,
    isAudioActive,
    markAwaitingGesture,
    prepare,
    rampTo,
    setSpeed,
  ]);

  const pause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    runningRef.current = false;
    setPlaying(false);
    muteAuxAudio();
    const completed = await rampTo(0, 850);
    if (completed) {
      audio.pause();
      setSpeed(0);
    }
  }, [muteAuxAudio, rampTo, setSpeed]);

  const toggleCenter = useCallback(() => {
    if (runningRef.current) {
      void pause();
      return;
    }
    void playFromGesture();
  }, [pause, playFromGesture]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const mediaSession = navigator.mediaSession;
    const handleMediaPlay = () => {
      void playFromGesture();
    };
    const handleMediaPause = () => {
      // Some system media-key implementations keep dispatching "pause" after
      // a background tab has paused instead of switching to the "play" action.
      // Treat that repeated action as a toggle so the same key can resume.
      if (runningRef.current) {
        void pause();
      } else {
        void playFromGesture();
      }
    };

    mediaSession.setActionHandler("play", handleMediaPlay);
    mediaSession.setActionHandler("pause", handleMediaPause);

    return () => {
      mediaSession.setActionHandler("play", null);
      mediaSession.setActionHandler("pause", null);
    };
  }, [pause, playFromGesture]);

  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    }
  }, [playing]);

  const loadAndPlayTrack = useCallback(
    (selected: Track) => {
      const audio = audioRef.current;
      if (!audio || !engageFromGesture()) return;

      ++rampTokenRef.current;
      audio.pause();
      audio.src = getTrackUrl(selected);
      audio.load();

      setSpeed(MIN_RATE);

      void audio
        .play()
        .then(() => {
          runningRef.current = true;
          setPlaying(true);
          clearAwaitingGesture();
          return rampTo(1, 1100);
        })
        .catch(() => {
          markAwaitingGesture();
        });
    },
    [
      clearAwaitingGesture,
      engageFromGesture,
      markAwaitingGesture,
      rampTo,
      setSpeed,
    ],
  );

  const goToTrackIndex = useCallback(
    async (index: number) => {
      const normalized =
        ((index % tracks.length) + tracks.length) % tracks.length;
      const selected = selectTrack(tracks[normalized]);
      await loadAndPlayTrack(selected);
    },
    [loadAndPlayTrack, selectTrack],
  );

  const moveTrack = useCallback(
    async (direction: -1 | 1) => {
      const current = selectedTrackRef.current ?? chooseRandomTrack();
      const currentIndex = tracks.findIndex((track) => track.id === current.id);
      const nextIndex =
        (currentIndex + direction + tracks.length) % tracks.length;
      await goToTrackIndex(nextIndex);
    },
    [chooseRandomTrack, goToTrackIndex],
  );

  const nextTrack = useCallback(() => moveTrack(1), [moveTrack]);
  const previousTrack = useCallback(() => moveTrack(-1), [moveTrack]);

  const currentTrackIndex = currentTrack
    ? tracks.findIndex((track) => track.id === currentTrack.id)
    : -1;

  const setScrubLevel = useCallback((level: number) => {
    if (!runningRef.current) return;

    const ctx = contextRef.current;
    const scrub = scrubRef.current;
    if (!ctx || ctx.state === "closed" || !scrub) return;

    const now = ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, level));
    scrub.gain.gain.setTargetAtTime(clamped * 0.048, now, 0.03);
    scrub.filter.frequency.setTargetAtTime(1600 + clamped * 2600, now, 0.05);
  }, []);

  const beginSeekScrub = useCallback(() => {
    engageFromGesture();

    scrubbingRef.current = true;
    const audio = audioRef.current;
    if (audio && runningRef.current) {
      audio.playbackRate = Math.max(MIN_RATE, rateRef.current * 0.78);
    }
    setScrubLevel(0.28);
  }, [engageFromGesture, setScrubLevel]);

  const scrubTo = useCallback(
    (seconds: number, scrubSpeed = 0) => {
      const audio = audioRef.current;
      if (!audio || !scrubbingRef.current) return;

      const catalogDuration = selectedTrackRef.current?.durationSeconds ?? 0;
      const duration = resolveDuration(audio, catalogDuration);
      if (!duration) return;

      const clamped = Math.max(0, Math.min(duration, seconds));
      audio.currentTime = clamped;
      setElapsedSeconds(clamped);

      const speed = Math.abs(scrubSpeed);
      const intensity = Math.min(1, 0.22 + speed * 1.8);
      setScrubLevel(intensity);
    },
    [setScrubLevel],
  );

  const endSeekScrub = useCallback(
    (seconds: number) => {
      scrubbingRef.current = false;

      const audio = audioRef.current;
      const ctx = contextRef.current;
      const catalogDuration = selectedTrackRef.current?.durationSeconds ?? 0;

      if (scrubRef.current && ctx && ctx.state !== "closed") {
        scrubRef.current.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      }

      if (!audio) return;

      const duration = resolveDuration(audio, catalogDuration);
      if (!duration) return;

      const clamped = Math.max(0, Math.min(duration, seconds));
      audio.currentTime = clamped;
      setElapsedSeconds(clamped);

      if (runningRef.current) {
        audio.playbackRate = Math.max(MIN_RATE, rateRef.current);
      }

      if (ctx && ctx.state !== "closed" && runningRef.current && crackleRef.current) {
        const baseline = rateRef.current * CRACKLE_BASE * staticLevelRef.current;
        const now = ctx.currentTime;
        crackleRef.current.gain.cancelScheduledValues(now);
        crackleRef.current.gain.setValueAtTime(baseline + 0.012, now);
        crackleRef.current.gain.setTargetAtTime(baseline, now + 0.05, 0.14);
      }
    },
    [],
  );

  const seekTo = useCallback(
    async (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      const catalogDuration = selectedTrackRef.current?.durationSeconds ?? 0;
      const duration = resolveDuration(audio, catalogDuration);
      if (!duration) return;

      const clamped = Math.max(0, Math.min(duration, seconds));
      if (!(await prepare())) return;

      setScrubLevel(0.42);
      audio.currentTime = clamped;
      setElapsedSeconds(clamped);

      window.setTimeout(() => {
        setScrubLevel(0);
      }, 70);
    },
    [prepare, setScrubLevel],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateElapsed = () => {
      setElapsedSeconds(audio.currentTime);
    };
    const handlePlay = () => {
      runningRef.current = true;
      setPlaying(true);
      clearAwaitingGesture();
      if (rateRef.current === 0) setSpeed(1);
    };
    const handlePause = () => {
      runningRef.current = false;
      setPlaying(false);
      muteAuxAudio();
      setSpeed(0);
    };
    const handleEnded = () => {
      void nextTrack();
    };

    audio.addEventListener("timeupdate", updateElapsed);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", updateElapsed);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [clearAwaitingGesture, muteAuxAudio, nextTrack, setSpeed]);

  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    let active = true;
    let detachGestureUnlock: (() => void) | undefined;

    const attachGestureUnlock = () => {
      const unlock = () => {
        if (!awaitingGestureRef.current) return;
        void playFromGesture().then((started) => {
          if (started) detachGestureUnlock?.();
        });
      };

      const pointerOptions = { capture: true } as const;
      const touchOptions = { capture: true, passive: true } as const;

      window.addEventListener("pointerdown", unlock, pointerOptions);
      window.addEventListener("touchstart", unlock, touchOptions);
      window.addEventListener("keydown", unlock, pointerOptions);

      return () => {
        window.removeEventListener("pointerdown", unlock, pointerOptions);
        window.removeEventListener("touchstart", unlock, touchOptions);
        window.removeEventListener("keydown", unlock, pointerOptions);
      };
    };

    const boot = async () => {
      chooseRandomTrack();
      if (!active) return;

      const audio = audioRef.current;
      if (audio) {
        audio.volume = Math.max(0, Math.min(1, volume));
      }

      const started = await start();
      if (!active) return;

      const audioAfterStart = audioRef.current;
      const actuallyPlaying =
        started && audioAfterStart ? isAudioActive(audioAfterStart) : false;

      if (!actuallyPlaying) {
        markAwaitingGesture();

        const retryWhenReady = () => {
          if (!active || !awaitingGestureRef.current) return;
          void start().then((retried) => {
            const audio = audioRef.current;
            if (retried && audio && isAudioActive(audio)) {
              clearAwaitingGesture();
              detachGestureUnlock?.();
              detachGestureUnlock = undefined;
            }
          });
        };

        audioAfterStart?.addEventListener("canplay", retryWhenReady, {
          once: true,
        });
        detachGestureUnlock = attachGestureUnlock();
      }
    };

    void boot();

    return () => {
      active = false;
      bootedRef.current = false;
      detachGestureUnlock?.();
    };
  }, [
    chooseRandomTrack,
    isAudioActive,
    markAwaitingGesture,
    playFromGesture,
    start,
    clearAwaitingGesture,
    volume,
  ]);

  useEffect(() => {
    const rampToken = rampTokenRef;
    return () => {
      ++rampToken.current;
      const ctx = contextRef.current;
      contextRef.current = null;
      crackleRef.current = null;
      scrubRef.current = null;
      if (ctx && ctx.state !== "closed") {
        void ctx.close();
      }
    };
  }, []);

  return {
    audioRef,
    playing,
    rate,
    currentTrack,
    currentTrackIndex,
    tracks,
    elapsedSeconds,
    durationSeconds: currentTrack?.durationSeconds ?? 0,
    toggleCenter,
    nextTrack,
    previousTrack,
    goToTrackIndex,
    beginSeekScrub,
    scrubTo,
    endSeekScrub,
    seekTo,
  };
}
