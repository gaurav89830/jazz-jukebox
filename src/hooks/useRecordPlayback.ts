"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTrackUrl,
  getTracksByCategory,
  tracks as allTracks,
  type Track,
} from "@/config/player";
import {
  readSelection,
  resolveSavedTrack,
  writeSelection,
} from "@/lib/selection";

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
  const vinylScrubWasPlayingRef = useRef(false);
  const rateRef = useRef(0);
  const staticLevelRef = useRef(staticLevel);
  const volumeRef = useRef(volume);
  const runningRef = useRef(false);
  const selectedTrackRef = useRef<Track | null>(allTracks[0] ?? null);
  const activeCategoryIdRef = useRef(allTracks[0]?.categoryId ?? "");
  const selectionReadyRef = useRef(false);
  const resumeSecondsRef = useRef(0);
  const canPersistProgressRef = useRef(true);
  const scratchBufferRef = useRef<{
    trackId: string;
    buffer: AudioBuffer;
  } | null>(null);
  const scratchLoadRef = useRef<{
    trackId: string;
    promise: Promise<AudioBuffer | null>;
  } | null>(null);
  const scratchNodeRef = useRef<AudioWorkletNode | null>(null);
  const scratchNodePromiseRef = useRef<Promise<AudioWorkletNode | null> | null>(
    null,
  );
  const scratchNodeTrackRef = useRef<string | null>(null);
  const scratchGainRef = useRef<GainNode | null>(null);
  const vinylScrubRateRef = useRef(0);
  const rampTokenRef = useRef(0);
  const awaitingGestureRef = useRef(false);
  const [rate, setRate] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(
    allTracks[0] ?? null,
  );
  const [activeCategoryId, setActiveCategoryId] = useState(
    allTracks[0]?.categoryId ?? "",
  );
  const [shuffle, setShuffle] = useState(false);
  const shuffleRef = useRef(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const playlistFor = useCallback((categoryId: string) => {
    const list = getTracksByCategory(categoryId);
    return list.length > 0 ? list : allTracks;
  }, []);

  const persistSelection = useCallback(
    (track: Track, categoryId: string, progressSeconds = 0) => {
      writeSelection({
        trackId: track.id,
        categoryId,
        progressSeconds: Math.max(0, progressSeconds),
        shuffle: shuffleRef.current,
      });
    },
    [],
  );

  const persistCurrentProgress = useCallback(() => {
    if (!canPersistProgressRef.current) return;
    const track = selectedTrackRef.current;
    if (!track) return;
    persistSelection(
      track,
      activeCategoryIdRef.current,
      audioRef.current?.currentTime ?? 0,
    );
  }, [persistSelection]);

  const applyResumePosition = useCallback((audio: HTMLAudioElement) => {
    const seconds = resumeSecondsRef.current;
    if (seconds <= 0) {
      canPersistProgressRef.current = true;
      return;
    }

    const duration = resolveDuration(
      audio,
      selectedTrackRef.current?.durationSeconds ?? 0,
    );
    if (!duration) return;

    if (seconds >= duration - 1.25) {
      resumeSecondsRef.current = 0;
      canPersistProgressRef.current = true;
      return;
    }

    const clamped = Math.max(0, Math.min(duration, seconds));
    audio.currentTime = clamped;
    setElapsedSeconds(clamped);
    resumeSecondsRef.current = 0;
    canPersistProgressRef.current = true;
  }, []);

  const scheduleResumePosition = useCallback(
    (audio: HTMLAudioElement) => {
      if (resumeSecondsRef.current <= 0) {
        canPersistProgressRef.current = true;
        return;
      }
      if (audio.readyState >= 1) {
        applyResumePosition(audio);
        return;
      }
      audio.addEventListener(
        "loadedmetadata",
        () => applyResumePosition(audio),
        { once: true },
      );
    },
    [applyResumePosition],
  );

  const selectTrack = useCallback(
    (
      selected: Track,
      categoryId = selected.categoryId,
      progressSeconds = 0,
    ) => {
      selectedTrackRef.current = selected;
      selectionReadyRef.current = true;
      resumeSecondsRef.current = progressSeconds;
      canPersistProgressRef.current = progressSeconds <= 0;
      if (categoryId !== activeCategoryIdRef.current) {
        activeCategoryIdRef.current = categoryId;
        setActiveCategoryId(categoryId);
      }
      setCurrentTrack(selected);
      setElapsedSeconds(progressSeconds);
      persistSelection(selected, categoryId, progressSeconds);
      return selected;
    },
    [persistSelection],
  );

  const chooseRandomTrack = useCallback(() => {
    if (selectionReadyRef.current && selectedTrackRef.current) {
      return selectedTrackRef.current;
    }

    const saved = readSelection();
    if (saved) {
      shuffleRef.current = saved.shuffle;
      setShuffle(saved.shuffle);
    }

    const restored = resolveSavedTrack(saved);
    if (restored) {
      return selectTrack(
        restored.track,
        restored.categoryId,
        restored.progressSeconds,
      );
    }

    const selected = allTracks[Math.floor(Math.random() * allTracks.length)];
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
    volumeRef.current = volume;
    if (audio) audio.volume = Math.max(0, Math.min(1, volume));
    if (scratchGainRef.current) {
      scratchGainRef.current.gain.value = Math.max(0, Math.min(1, volume));
    }
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

  const loadScratchBuffer = useCallback(
    (ctx: AudioContext, track: Track | null) => {
      if (!track) return Promise.resolve(null);
      if (scratchBufferRef.current?.trackId === track.id) {
        return Promise.resolve(scratchBufferRef.current.buffer);
      }
      if (scratchLoadRef.current?.trackId === track.id) {
        return scratchLoadRef.current.promise;
      }

      const promise = fetch(getTrackUrl(track), { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error("Unable to load scratch audio");
          return response.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          if (selectedTrackRef.current?.id === track.id) {
            scratchBufferRef.current = { trackId: track.id, buffer };
          }
          return buffer;
        })
        .catch(() => null);

      scratchLoadRef.current = { trackId: track.id, promise };
      return promise;
    },
    [],
  );

  const prepareScratchEngine = useCallback(
    async (ctx: AudioContext, track: Track | null) => {
      if (!track || !ctx.audioWorklet) return null;

      let node = scratchNodeRef.current;
      if (!node) {
        if (!scratchNodePromiseRef.current) {
          scratchNodePromiseRef.current = ctx.audioWorklet
            .addModule("/audio/vinyl-scratch-processor.js")
            .then(() => {
              const created = new AudioWorkletNode(
                ctx,
                "vinyl-scratch-processor",
                {
                  numberOfInputs: 0,
                  numberOfOutputs: 1,
                  outputChannelCount: [2],
                },
              );
              const gain = ctx.createGain();
              gain.gain.value = Math.max(0, Math.min(1, volumeRef.current));
              created.connect(gain).connect(ctx.destination);
              scratchGainRef.current = gain;
              created.port.onmessage = ({ data }) => {
                if (data.type !== "position") return;
                const audio = audioRef.current;
                if (!audio) return;
                audio.currentTime = data.positionSeconds;
                setElapsedSeconds(data.positionSeconds);
              };
              scratchNodeRef.current = created;
              return created;
            })
            .catch(() => null);
        }
        node = await scratchNodePromiseRef.current;
      }

      if (!node || scratchNodeTrackRef.current === track.id) return node;
      const buffer = await loadScratchBuffer(ctx, track);
      if (!buffer || selectedTrackRef.current?.id !== track.id) return node;

      const channels = Array.from(
        { length: buffer.numberOfChannels },
        (_, channel) => buffer.getChannelData(channel).slice(),
      );
      node.port.postMessage(
        {
          type: "load",
          channels,
          sampleRate: buffer.sampleRate,
        },
        channels.map((channel) => channel.buffer),
      );
      scratchNodeTrackRef.current = track.id;
      return node;
    },
    [loadScratchBuffer],
  );

  const waitForResumePosition = useCallback(
    async (audio: HTMLAudioElement) => {
      if (resumeSecondsRef.current <= 0) {
        canPersistProgressRef.current = true;
        return;
      }
      if (audio.readyState >= 1) {
        applyResumePosition(audio);
        return;
      }
      await new Promise<void>((resolve) => {
        let settled = false;
        const onReady = () => done();
        const done = (force = false) => {
          if (settled) return;
          if (!force && audio.readyState < 1 && resumeSecondsRef.current > 0) {
            return;
          }
          settled = true;
          audio.removeEventListener("loadedmetadata", onReady);
          audio.removeEventListener("canplay", onReady);
          window.clearTimeout(timer);
          applyResumePosition(audio);
          resolve();
        };
        const timer = window.setTimeout(() => done(true), 2000);
        audio.addEventListener("loadedmetadata", onReady);
        audio.addEventListener("canplay", onReady);
      });
    },
    [applyResumePosition],
  );

  const engageFromGesture = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return false;

    if (!audio.hasAttribute("src")) {
      audio.src = getTrackUrl(chooseRandomTrack());
    }
    setPitchFollowsSpeed(audio);
    scheduleResumePosition(audio);

    const ctx = ensureAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    return true;
  }, [chooseRandomTrack, ensureAudioContext, scheduleResumePosition]);

  const prepare = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;

    if (!audio.hasAttribute("src")) {
      audio.src = getTrackUrl(chooseRandomTrack());
    }
    setPitchFollowsSpeed(audio);
    await waitForResumePosition(audio);
    return true;
  }, [chooseRandomTrack, waitForResumePosition]);

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

  const playTrack = useCallback(
    async (selected: Track, categoryId = activeCategoryIdRef.current) => {
      selectTrack(selected, categoryId);
      await loadAndPlayTrack(selected);
    },
    [loadAndPlayTrack, selectTrack],
  );

  const goToTrackIndex = useCallback(
    async (index: number) => {
      const playlist = playlistFor(activeCategoryIdRef.current);
      if (index < 0 || index >= playlist.length) return;
      const next = playlist[index];
      if (!next) return;
      await playTrack(next);
    },
    [playTrack, playlistFor],
  );

  const enterCategory = useCallback(
    (categoryId: string) => {
      const playlist = playlistFor(categoryId);
      const first = playlist[0];
      if (!first) return;

      activeCategoryIdRef.current = categoryId;
      setActiveCategoryId(categoryId);

      const current = selectedTrackRef.current;
      const inPlaylist = current
        ? playlist.some((track) => track.id === current.id)
        : false;
      if (!inPlaylist) {
        void playTrack(first);
        return;
      }
      if (current) {
        persistSelection(
          current,
          categoryId,
          audioRef.current?.currentTime ?? 0,
        );
      }
    },
    [persistSelection, playTrack, playlistFor],
  );

  const playShuffledNext = useCallback(async () => {
    const playlist = playlistFor(activeCategoryIdRef.current);
    const currentId = selectedTrackRef.current?.id;
    const pool = playlist.filter((track) => track.id !== currentId);
    const next =
      pool[Math.floor(Math.random() * pool.length)] ?? playlist[0];
    if (!next) return;
    await playTrack(next);
  }, [playTrack, playlistFor]);

  const moveTrack = useCallback(
    async (direction: -1 | 1) => {
      const playlist = playlistFor(activeCategoryIdRef.current);
      if (playlist.length === 0) return;
      const current = selectedTrackRef.current ?? chooseRandomTrack();
      const currentIndex = playlist.findIndex((track) => track.id === current.id);
      if (currentIndex < 0) return;
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= playlist.length) return;
      await goToTrackIndex(nextIndex);
    },
    [chooseRandomTrack, goToTrackIndex, playlistFor],
  );

  const nextTrack = useCallback(() => {
    if (shuffleRef.current) {
      void playShuffledNext();
      return;
    }
    void moveTrack(1);
  }, [moveTrack, playShuffledNext]);

  const previousTrack = useCallback(() => moveTrack(-1), [moveTrack]);

  const toggleShuffle = useCallback(() => {
    const next = !shuffleRef.current;
    shuffleRef.current = next;
    setShuffle(next);
    const track = selectedTrackRef.current;
    if (track) {
      persistSelection(
        track,
        activeCategoryIdRef.current,
        audioRef.current?.currentTime ?? 0,
      );
    }
  }, [persistSelection]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const mediaSession = navigator.mediaSession;
    const handleNextTrack = () => {
      void nextTrack();
    };
    const handlePreviousTrack = () => {
      void previousTrack();
    };

    mediaSession.setActionHandler("nexttrack", handleNextTrack);
    mediaSession.setActionHandler("previoustrack", handlePreviousTrack);

    return () => {
      mediaSession.setActionHandler("nexttrack", null);
      mediaSession.setActionHandler("previoustrack", null);
    };
  }, [nextTrack, previousTrack]);

  const playlist = playlistFor(activeCategoryId);
  const currentTrackIndex = currentTrack
    ? playlist.findIndex((track) => track.id === currentTrack.id)
    : -1;

  const setScrubLevel = useCallback((level: number) => {
    if (!runningRef.current && !scrubbingRef.current) return;

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
      persistCurrentProgress();
    },
    [persistCurrentProgress],
  );

  const beginVinylScrub = useCallback(() => {
    engageFromGesture();

    const audio = audioRef.current;
    vinylScrubWasPlayingRef.current = runningRef.current;
    scrubbingRef.current = true;
    ++rampTokenRef.current;
    runningRef.current = false;
    setPlaying(false);
    muteAuxAudio();
    audio?.pause();
    setSpeed(0);
    vinylScrubRateRef.current = 0;

    const ctx = contextRef.current;
    const track = selectedTrackRef.current;
    if (ctx && track) {
      void prepareScratchEngine(ctx, track).then((node) => {
        if (!node || !scrubbingRef.current) return;
        node.port.postMessage({
          type: "start",
          positionSeconds: audioRef.current?.currentTime ?? 0,
        });
        node.port.postMessage({
          type: "rate",
          rate: vinylScrubRateRef.current,
        });
      });
    }
  }, [
    engageFromGesture,
    muteAuxAudio,
    prepareScratchEngine,
    setSpeed,
  ]);

  const scrubVinylBy = useCallback(
    (deltaSeconds: number, scrubSpeed = 0) => {
      const audio = audioRef.current;
      if (!audio || !scrubbingRef.current) return;

      vinylScrubRateRef.current = scrubSpeed;
      const node = scratchNodeRef.current;
      if (node && scratchNodeTrackRef.current === selectedTrackRef.current?.id) {
        node.port.postMessage({ type: "rate", rate: scrubSpeed });
        return;
      }

      const duration = resolveDuration(
        audio,
        selectedTrackRef.current?.durationSeconds ?? 0,
      );
      const position = Math.max(
        0,
        Math.min(duration, audio.currentTime + deltaSeconds),
      );
      audio.currentTime = position;
      setElapsedSeconds(position);
    },
    [],
  );

  const endVinylScrub = useCallback(() => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    vinylScrubRateRef.current = 0;
    scratchNodeRef.current?.port.postMessage({ type: "rate", rate: 0 });
    scratchNodeRef.current?.port.postMessage({ type: "stop" });
    persistCurrentProgress();

    const shouldResume = vinylScrubWasPlayingRef.current;
    vinylScrubWasPlayingRef.current = false;
    if (shouldResume) {
      window.setTimeout(() => {
        void playFromGesture();
      }, 35);
    }
  }, [persistCurrentProgress, playFromGesture]);

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
      persistCurrentProgress();

      window.setTimeout(() => {
        setScrubLevel(0);
      }, 70);
    },
    [persistCurrentProgress, prepare, setScrubLevel],
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
      persistCurrentProgress();
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
  }, [
    clearAwaitingGesture,
    muteAuxAudio,
    nextTrack,
    persistCurrentProgress,
    setSpeed,
  ]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      persistCurrentProgress();
    }, 1000);

    const flush = () => persistCurrentProgress();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);

    return () => {
      window.clearInterval(tick);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [persistCurrentProgress]);

  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    chooseRandomTrack();

    let active = true;
    let detachGestureUnlock: (() => void) | undefined;
    let bootTimer: number | undefined;

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
      if (runningRef.current) return;
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

    const scheduleBoot = () => {
      bootTimer = window.setTimeout(() => {
        void boot();
      }, 250);
    };

    if (document.readyState === "complete") {
      scheduleBoot();
    } else {
      window.addEventListener("load", scheduleBoot, { once: true });
    }

    return () => {
      active = false;
      bootedRef.current = false;
      window.removeEventListener("load", scheduleBoot);
      if (bootTimer !== undefined) window.clearTimeout(bootTimer);
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
      scratchNodeRef.current = null;
      scratchNodePromiseRef.current = null;
      scratchGainRef.current = null;
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
    tracks: playlist,
    activeCategoryId,
    elapsedSeconds,
    durationSeconds: currentTrack?.durationSeconds ?? 0,
    toggleCenter,
    nextTrack,
    previousTrack,
    playTrack,
    enterCategory,
    shuffle,
    toggleShuffle,
    goToTrackIndex,
    beginSeekScrub,
    scrubTo,
    endSeekScrub,
    beginVinylScrub,
    scrubVinylBy,
    endVinylScrub,
    seekTo,
  };
}
