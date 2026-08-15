"use client";

import { useEffect, useRef } from "react";

type VinylRecordProps = {
  rate: number;
  playing: boolean;
  onToggle: () => void;
};

const FULL_SPEED_DEG_PER_SEC = 286;

export function VinylRecord({
  rate,
  playing,
  onToggle,
}: VinylRecordProps) {
  const discRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  const rateRef = useRef(rate);

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  useEffect(() => {
    const disc = discRef.current;
    if (!disc) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      angleRef.current =
        (angleRef.current + FULL_SPEED_DEG_PER_SEC * rateRef.current * dt) %
        360;
      disc.style.transform = `rotate(${angleRef.current}deg)`;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <button
      type="button"
      className="record-control relative size-16 touch-none select-none sm:size-20"
      onClick={onToggle}
      aria-label={playing ? "Pause Noir Jazz" : "Play Noir Jazz"}
      aria-pressed={playing}
    >
      <div ref={discRef} className="vinyl">
        <div className="vinyl-grooves" />
        <div className="vinyl-shine" />
        <div className="vinyl-label" />
        <div className="vinyl-spindle" />
      </div>
    </button>
  );
}
