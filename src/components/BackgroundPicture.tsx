/* The source images are already hand-optimized responsive AVIF files. */
/* eslint-disable @next/next/no-img-element */

import type { Background } from "@/config/player";

type BackgroundPictureProps = {
  background: Background;
  priority?: boolean;
};

export function BackgroundPicture({
  background,
  priority = false,
}: BackgroundPictureProps) {
  return (
    <img
      src={background.src}
      srcSet={background.srcSet}
      sizes="100vw"
      alt={background.alt}
      width={background.width}
      height={background.height}
      fetchPriority={priority ? "high" : "low"}
      decoding="async"
      draggable={false}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
