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

export function useRecordPlayback() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const crackleRef = useRef<GainNode | null>(null);
  const rateRef = useRef(0);
  const runningRef = useRef(false);
  const selectedTrackRef = useRef<Track | null>(null);
  const rampTokenRef = useRef(0);
  const [rate, setRate] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);

  const chooseRandomTrack = useCallback(() => {
    if (selectedTrackRef.current) return selectedTrackRef.current;

    const selected = tracks[Math.floor(Math.random() * tracks.length)];
    selectedTrackRef.current = selected;
    setCurrentTrack(selected);
    return selected;
  }, []);

  const setSpeed = useCallback((speed: number) => {
    const next = Math.max(0, Math.min(1, speed));
    rateRef.current = next;
    setRate(next);

    const audio = audioRef.current;
    if (audio) audio.playbackRate = Math.max(MIN_RATE, next);

    const ctx = contextRef.current;
    if (ctx && crackleRef.current) {
      crackleRef.current.gain.setTargetAtTime(next * 0.035, ctx.currentTime, 0.04);
    }
  }, []);

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
    }
    await contextRef.current.resume();
    return true;
  }, [chooseRandomTrack]);

  const start = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !(await prepare())) return;

    ++rampTokenRef.current;
    setSpeed(Math.max(MIN_RATE, rateRef.current));
    try {
      await audio.play();
      runningRef.current = true;
      setPlaying(true);
      await rampTo(1, 1100);
    } catch {
      runningRef.current = false;
      setPlaying(false);
      setSpeed(0);
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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const selected = chooseRandomTrack();
    audio.src = getTrackUrl(selected);
    audio.volume = 0.72;
    audio.playbackRate = 1;
    setPitchFollowsSpeed(audio);

    let active = true;
    void audio.play().then(
      () => {
        if (!active) return;
        runningRef.current = true;
        setPlaying(true);
        setSpeed(1);
      },
      () => {
        if (!active) return;
        runningRef.current = false;
        setPlaying(false);
        setSpeed(0);
      },
    );

    return () => {
      active = false;
    };
  }, [chooseRandomTrack, setSpeed]);

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
    toggleCenter,
  };
}
