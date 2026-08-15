export const widths = [640, 1024, 1675] as const;

export type Background = {
  alt: string;
  width: number;
  height: number;
  src: string;
  srcSet: string;
};

function srcset(id: string) {
  return widths
    .map((width) => `/backgrounds/${id}-${width}.avif ${width}w`)
    .join(", ");
}

export const background: Background = {
  alt: "Retro jazz club with a saxophone resting on a grand piano",
  width: 1675,
  height: 939,
  src: "/backgrounds/jazz-with-sax-1675.avif",
  srcSet: srcset("jazz-with-sax"),
};

/**
 * Keep audio off the critical path. Set NEXT_PUBLIC_AUDIO_URL to a CDN
 * object (S3 + CloudFront). Until then, Play uses a tiny local placeholder.
 */
export const track = {
  src: process.env.NEXT_PUBLIC_AUDIO_URL ?? "/audio/local-jazz-noir.mp3",
  title: "Ory's Creole Trombone",
  artist: "Kid Ory's Sunshine Orchestra",
  year: "1922",
};
