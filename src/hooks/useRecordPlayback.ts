"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTrackUrl,
  tracks,
  type Track,
} from "@/config/player";

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
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const selectTrack = useCallback((selected: Track) => {
    selectedTrackRef.current = selected;
    setCurrentTrack(selected);
    setElapsedSeconds(0);
    return selected;
  }, []);

  const chooseRandomTrack = useCallback(() => {
    if (selectedTrackRef.current) return selectedTrackRef.current;

    const selected = tracks[Math.floor(Math.random() * tracks.length)];
    return selectTrack(selected);
  }, [selectTrack]);

  const setSpeed = useCallback((speed: number) => {
    const next = Math.max(0, Math.min(1, speed));
    rateRef.current = next;
    setRate(next);

    const audio = audioRef.current;
    if (audio) audio.playbackRate = Math.max(MIN_RATE, next);

    const ctx = contextRef.current;
    if (ctx && crackleRef.current) {
      crackleRef.current.gain.setTargetAtTime(
        next * CRACKLE_BASE * staticLevelRef.current,
        ctx.currentTime,
        0.04,
      );
    }
  }, []);

  useEffect(() => {
    staticLevelRef.current = staticLevel;
    const ctx = contextRef.current;
    if (ctx && crackleRef.current) {
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
        const frame = (now: number) => {
          if (token !== rampTokenRef.current) {
            resolve(false);
            return;
          }
          const progress = Math.min(1, (now - started) / duration);
          setSpeed(start + (target - start) * easeOut(progress));
          if (progress < 1) {
            requestAnimationFrame(frame);
          } else {
            resolve(true);
          }
        };
        requestAnimationFrame(frame);
      });
    },
    [setSpeed],
  );

  const prepare = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;

    if (!audio.hasAttribute("src")) {
      audio.src = getTrackUrl(chooseRandomTrack());
    }
    setPitchFollowsSpeed(audio);

    if (!contextRef.current) {
      contextRef.current = new AudioContext();
      crackleRef.current = createCrackle(contextRef.current);
      scrubRef.current = createScrubBus(contextRef.current);
    }
    await contextRef.current.resume();
    return true;
  }, [chooseRandomTrack]);

  const start = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !(await prepare())) return false;

    ++rampTokenRef.current;
    setSpeed(Math.max(MIN_RATE, rateRef.current));
    try {
      await audio.play();
      runningRef.current = true;
      setPlaying(true);
      await rampTo(1, 1100);
      return true;
    } catch {
      runningRef.current = false;
      setPlaying(false);
      setSpeed(0);
      return false;
    }
  }, [prepare, rampTo, setSpeed]);

  const pause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    runningRef.current = false;
    setPlaying(false);
    const completed = await rampTo(0, 850);
    if (completed) {
      audio.pause();
      setSpeed(0);
    }
  }, [rampTo, setSpeed]);

  const toggleCenter = useCallback(async () => {
    if (runningRef.current) {
      await pause();
    } else {
      await start();
    }
  }, [pause, start]);

  const loadAndPlayTrack = useCallback(
    async (selected: Track) => {
      const audio = audioRef.current;
      if (!audio || !(await prepare())) return;

      ++rampTokenRef.current;
      audio.pause();
      audio.src = getTrackUrl(selected);
      audio.load();

      setSpeed(MIN_RATE);
      try {
        await audio.play();
        runningRef.current = true;
        setPlaying(true);
        await rampTo(1, 650);
      } catch {
        runningRef.current = false;
        setPlaying(false);
        setSpeed(0);
      }
    },
    [prepare, rampTo, setSpeed],
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
    const ctx = contextRef.current;
    const scrub = scrubRef.current;
    if (!ctx || !scrub) return;

    const now = ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, level));
    scrub.gain.gain.setTargetAtTime(clamped * 0.048, now, 0.03);
    scrub.filter.frequency.setTargetAtTime(1600 + clamped * 2600, now, 0.05);
  }, []);

  const beginSeekScrub = useCallback(async () => {
    if (!(await prepare())) return;

    scrubbingRef.current = true;
    const audio = audioRef.current;
    if (audio && runningRef.current) {
      audio.playbackRate = Math.max(MIN_RATE, rateRef.current * 0.78);
    }
    setScrubLevel(0.28);
  }, [prepare, setScrubLevel]);

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

      if (scrubRef.current && ctx) {
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

      if (ctx && crackleRef.current) {
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
    const handleEnded = () => {
      void nextTrack();
    };

    audio.addEventListener("timeupdate", updateElapsed);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", updateElapsed);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [nextTrack]);

  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    let active = true;

    const unlockPlayback = () => {
      if (runningRef.current) return;
      void start();
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
      if (!started) {
        window.addEventListener("pointerdown", unlockPlayback, { once: true });
      }
    };

    void boot();

    return () => {
      active = false;
      window.removeEventListener("pointerdown", unlockPlayback);
    };
  }, [chooseRandomTrack, start]);

  useEffect(() => {
    const rampToken = rampTokenRef;
    return () => {
      ++rampToken.current;
      void contextRef.current?.close();
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
