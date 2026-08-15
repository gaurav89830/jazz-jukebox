"use client";

import { useCallback, useEffect, useState } from "react";

export type VinylDisplay = "off" | "left" | "right";

export type PlayerSettings = {
  vinylDisplay: VinylDisplay;
  autohideJuke: boolean;
  volume: number;
  staticLevel: number;
};

const STORAGE_KEY = "noir-jazz-settings";

export const defaultSettings: PlayerSettings = {
  vinylDisplay: "left",
  autohideJuke: true,
  volume: 0.72,
  staticLevel: 1,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

type StoredSettings = Partial<PlayerSettings> & {
  showVinyl?: boolean;
  vinylPosition?: string;
};

function readVinylDisplay(parsed: StoredSettings): VinylDisplay {
  if (
    parsed.vinylDisplay === "off" ||
    parsed.vinylDisplay === "left" ||
    parsed.vinylDisplay === "right"
  ) {
    return parsed.vinylDisplay;
  }

  if (parsed.showVinyl === false) return "off";
  if (parsed.vinylPosition === "right") return "right";
  return defaultSettings.vinylDisplay;
}

function readSettings(): PlayerSettings {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as StoredSettings;
    return {
      vinylDisplay: readVinylDisplay(parsed),
      autohideJuke: parsed.autohideJuke ?? defaultSettings.autohideJuke,
      volume: clamp01(parsed.volume ?? defaultSettings.volume),
      staticLevel: clamp01(parsed.staticLevel ?? defaultSettings.staticLevel),
    };
  } catch {
    return defaultSettings;
  }
}

export function usePlayerSettings() {
  const [settings, setSettings] = useState<PlayerSettings>(defaultSettings);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(readSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [hydrated, settings]);

  const updateSetting = useCallback(
    <K extends keyof PlayerSettings>(key: K, value: PlayerSettings[K]) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  return { settings, updateSetting };
}
