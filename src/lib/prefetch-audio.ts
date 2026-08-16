const AUDIO_CACHE = "noir-jazz-audio-v1";

export function prefetchAudio(url: string) {
  if (typeof window === "undefined") return;

  const link = document.createElement("link");
  link.rel = "prefetch";
  link.as = "fetch";
  link.href = url;
  link.crossOrigin = "anonymous";
  document.head.append(link);

  if (!("caches" in window)) return;

  void caches.open(AUDIO_CACHE).then(async (cache) => {
    const cached = await cache.match(url);
    if (cached) return;

    try {
      const response = await fetch(url, { cache: "force-cache" });
      if (response.ok) {
        await cache.put(url, response);
      }
    } catch {
      // Best-effort warm cache; playback still works without it.
    }
  });
}
