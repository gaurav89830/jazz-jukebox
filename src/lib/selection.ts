import { getTracksByCategory, tracks, type Track } from "@/config/player";

const STORAGE_KEY = "noir-jazz-selection";

export type StoredSelection = {
  trackId: string;
  categoryId: string;
  progressSeconds: number;
  shuffle: boolean;
};

function readProgressSeconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

export function readSelection(): StoredSelection | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSelection>;
    if (!parsed.trackId || !parsed.categoryId) return null;
    return {
      trackId: parsed.trackId,
      categoryId: parsed.categoryId,
      progressSeconds: readProgressSeconds(parsed.progressSeconds),
      shuffle: parsed.shuffle === true,
    };
  } catch {
    return null;
  }
}

export function writeSelection(selection: StoredSelection) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
}

export function resolveSavedTrack(
  saved: StoredSelection | null,
): { track: Track; categoryId: string; progressSeconds: number } | null {
  if (!saved) return null;

  const playlist = getTracksByCategory(saved.categoryId);
  const inCategory = playlist.find((track) => track.id === saved.trackId);
  if (inCategory) {
    return {
      track: inCategory,
      categoryId: saved.categoryId,
      progressSeconds: saved.progressSeconds,
    };
  }

  const match = tracks.find((track) => track.id === saved.trackId);
  if (match) {
    return {
      track: match,
      categoryId: match.categoryId,
      progressSeconds: saved.progressSeconds,
    };
  }

  if (playlist[0]) {
    return {
      track: playlist[0],
      categoryId: saved.categoryId,
      progressSeconds: 0,
    };
  }

  return null;
}
