import catalog from "@/data/tracks.json";
import { JazzPlayer } from "@/components/JazzPlayer";
import { StructuredData } from "@/components/StructuredData";
import { siteConfig } from "@/config/site";

export default function Home() {
  return (
    <>
      <StructuredData />
      <JazzPlayer />

      <div className="seo-fallback" aria-hidden="true">
        <h1>{siteConfig.name}</h1>
        <p>{siteConfig.description}</p>
        <h2>{catalog.collection.title} playlist</h2>
        <ul>
          {catalog.tracks.map((track) => (
            <li key={track.id} id={`track-${track.id}`}>
              {track.displayTitle}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
