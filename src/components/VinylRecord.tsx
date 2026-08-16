"use client";

import { useEffect, useRef } from "react";

type VinylRecordProps = {
  rate: number;
  playing: boolean;
  onToggle: () => void;
  onScrubStart: () => void;
  onScrub: (deltaSeconds: number, scrubSpeed: number) => void;
  onScrubEnd: () => void;
  className?: string;
};

const FULL_SPEED_DEG_PER_SEC = 286;
const LABEL_CLIP_ID = "vinyl-label-clip";

// Bottom arc on the label circle (viewBox center 50,50). r=37 sits mid-band
// between gold core (r=24) and label edge (r=50).
const NOIR_ARC_RADIUS = 37;
const NOIR_LETTERS = [
  { char: "N", angle: 218 },
  { char: "O", angle: 192 },
  { char: "I", angle: 170 },
  { char: "R", angle: 148 },
] as const;

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleFromNorth: number,
) {
  const radians = ((angleFromNorth - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

export function VinylRecord({
  rate,
  playing,
  onToggle,
  onScrubStart,
  onScrub,
  onScrubEnd,
  className,
}: VinylRecordProps) {
  const discRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  const rateRef = useRef(rate);
  const scrubRef = useRef<{
    pointerId: number;
    angle: number;
    time: number;
  } | null>(null);
  const scrubIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (scrubRef.current) {
        frame = requestAnimationFrame(tick);
        return;
      }
      angleRef.current =
        (angleRef.current + FULL_SPEED_DEG_PER_SEC * rateRef.current * dt) %
        360;
      disc.style.transform = `rotate(${angleRef.current}deg)`;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (scrubIdleTimerRef.current) {
        clearTimeout(scrubIdleTimerRef.current);
      }
    };
  }, []);

  const getPointerAngle = (
    element: HTMLElement,
    clientX: number,
    clientY: number,
  ) => {
    const rect = element.getBoundingClientRect();
    return Math.atan2(
      clientY - (rect.top + rect.height / 2),
      clientX - (rect.left + rect.width / 2),
    );
  };

  const finishScrub = (pointerId: number) => {
    if (scrubRef.current?.pointerId !== pointerId) return;
    if (scrubIdleTimerRef.current) {
      clearTimeout(scrubIdleTimerRef.current);
      scrubIdleTimerRef.current = null;
    }
    scrubRef.current = null;
    onScrubEnd();
  };

  return (
    <button
      type="button"
      tabIndex={-1}
      className={`record-control relative touch-none select-none ${className ?? "size-16 sm:size-20"}`}
      onPointerDown={(event) => {
        if (!event.isPrimary) return;
        event.preventDefault();

        const rect = event.currentTarget.getBoundingClientRect();
        const distanceFromCenter = Math.hypot(
          event.clientX - (rect.left + rect.width / 2),
          event.clientY - (rect.top + rect.height / 2),
        );
        if (distanceFromCenter <= Math.min(rect.width, rect.height) * 0.18) {
          onToggle();
          return;
        }

        event.currentTarget.setPointerCapture(event.pointerId);
        scrubRef.current = {
          pointerId: event.pointerId,
          angle: getPointerAngle(
            event.currentTarget,
            event.clientX,
            event.clientY,
          ),
          time: performance.now(),
        };
        onScrubStart();
      }}
      onPointerMove={(event) => {
        const scrub = scrubRef.current;
        if (!scrub || scrub.pointerId !== event.pointerId) return;
        event.preventDefault();

        const now = performance.now();
        const nextAngle = getPointerAngle(
          event.currentTarget,
          event.clientX,
          event.clientY,
        );
        let deltaRadians = nextAngle - scrub.angle;
        if (deltaRadians > Math.PI) deltaRadians -= Math.PI * 2;
        if (deltaRadians < -Math.PI) deltaRadians += Math.PI * 2;

        const deltaDegrees = (deltaRadians * 180) / Math.PI;
        const deltaSeconds = deltaDegrees / FULL_SPEED_DEG_PER_SEC;
        const elapsed = Math.max(0.001, (now - scrub.time) / 1000);

        angleRef.current = (angleRef.current + deltaDegrees + 360) % 360;
        if (discRef.current) {
          discRef.current.style.transform = `rotate(${angleRef.current}deg)`;
        }

        scrub.angle = nextAngle;
        scrub.time = now;
        onScrub(deltaSeconds, deltaSeconds / elapsed);
        if (scrubIdleTimerRef.current) {
          clearTimeout(scrubIdleTimerRef.current);
        }
        scrubIdleTimerRef.current = setTimeout(() => {
          onScrub(0, 0);
          scrubIdleTimerRef.current = null;
        }, 45);
      }}
      onPointerUp={(event) => finishScrub(event.pointerId)}
      onPointerCancel={(event) => finishScrub(event.pointerId)}
      onLostPointerCapture={(event) => finishScrub(event.pointerId)}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={
        playing
          ? "Press the center to pause, or rotate the record to scrub"
          : "Press the center to play, or rotate the record to scrub"
      }
    >
      <div className="vinyl-shell">
        <div ref={discRef} className="vinyl-disc">
          <div className="vinyl-grooves" />
          <div className="vinyl-label">
            <svg
              className="vinyl-label-art"
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <defs>
                <clipPath id={LABEL_CLIP_ID}>
                  <circle cx="50" cy="50" r="50" />
                </clipPath>
              </defs>
              <g clipPath={`url(#${LABEL_CLIP_ID})`}>
                <path
                  className="vinyl-label-band"
                  d="M 0 43 L 100 62 L 100 100 L 0 100 Z"
                />
                <circle
                  className="vinyl-label-core"
                  cx="50"
                  cy="50"
                  r="24"
                />
                {NOIR_LETTERS.map(({ char, angle }) => {
                  const { x, y } = polarToCartesian(
                    50,
                    50,
                    NOIR_ARC_RADIUS,
                    angle,
                  );
                  return (
                    <text
                      key={char}
                      className="vinyl-label-title"
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${angle - 180} ${x} ${y})`}
                    >
                      {char}
                    </text>
                  );
                })}
              </g>
            </svg>
          </div>
        </div>
        <div className="vinyl-shine" />
        <div className="vinyl-spindle" />
      </div>
    </button>
  );
}
