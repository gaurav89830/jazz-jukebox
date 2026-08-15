export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const siteConfig = {
  name: "Midnight Jazz",
  shortName: "Midnight Jazz",
  title: "Midnight Jazz — Noir Vinyl Player",
  description:
    "A cinematic noir jazz player with a spinning vinyl record, curated late-night tracks, and a retro jukebox. Press play and drift into smoke, sax, and midnight ambience.",
  tagline: "Noir jazz on vinyl, full screen.",
  locale: "en_US",
  keywords: [
    "jazz player",
    "vinyl player",
    "noir jazz",
    "online jazz radio",
    "ambient jazz",
    "late night jazz",
    "retro music player",
    "jukebox",
    "vinyl record player",
    "jazz lounge",
  ],
  ogImage: {
    url: "/backgrounds/jazz-with-sax-1675.avif",
    width: 1675,
    height: 939,
    alt: "Retro jazz club with a saxophone resting on a grand piano",
  },
  twitterHandle: undefined as string | undefined,
  category: "music",
} as const;
