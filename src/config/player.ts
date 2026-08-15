import catalog from "@/data/tracks.json";

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

export type Track = (typeof catalog.tracks)[number];

export const tracks = catalog.tracks;

export const audioBaseUrl = (
  process.env.NEXT_PUBLIC_AUDIO_BASE_URL ??
  "https://kgplklezapcbilbhruuy.supabase.co/storage/v1/object/public/noir-jazz"
).replace(/\/$/, "");

export function getTrackUrl(track: Track) {
  return `${audioBaseUrl}/${encodeURIComponent(track.file)}`;
}
