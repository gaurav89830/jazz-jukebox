import catalog from "@/data/tracks.json";
import { siteConfig, siteUrl } from "@/config/site";
import { getTrackUrl } from "@/config/player";

export function getStructuredData() {
  const tracks = catalog.tracks.map((track, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: {
      "@type": "MusicRecording",
      name: track.displayTitle,
      url: `${siteUrl}/#track-${track.id}`,
      duration: `PT${Math.round(track.durationSeconds)}S`,
      encodingFormat: track.mimeType,
      contentUrl: `${siteUrl}${getTrackUrl(track)}`,
    },
  }));

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteConfig.name,
      description: siteConfig.description,
      url: siteUrl,
      inLanguage: "en-US",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: siteConfig.name,
      description: siteConfig.description,
      url: siteUrl,
      applicationCategory: "MusicApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "Spinning vinyl playback",
        "Curated noir jazz playlist",
        "Fullscreen retro jukebox",
        "Keyboard and touch controls",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "MusicPlaylist",
      name: catalog.collection.title,
      numTracks: catalog.collection.trackCount,
      description: siteConfig.description,
      track: catalog.tracks.map((track) => ({
        "@type": "MusicRecording",
        name: track.displayTitle,
        url: `${siteUrl}/#track-${track.id}`,
        duration: `PT${Math.round(track.durationSeconds)}S`,
        encodingFormat: track.mimeType,
        contentUrl: `${siteUrl}${getTrackUrl(track)}`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${catalog.collection.title} tracklist`,
      numberOfItems: catalog.tracks.length,
      itemListElement: tracks,
    },
  ];
}
