"use client";

import { useSyncExternalStore } from "react";

// Cài đặt (âm thanh, rung, kính lúp) — app gốc lưu trong SharedPreferences.
export type Prefs = { sound: boolean; vibration: boolean; magnifier: boolean };

const KEY = "ktd-prefs";
const DEFAULTS: Prefs = { sound: true, vibration: true, magnifier: false };

let current: Prefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load(): Prefs {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {
      current = DEFAULTS;
    }
  }
  return current;
}

export function getPrefs(): Prefs {
  return load();
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  current = { ...load(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* chế độ riêng tư: chỉ giữ trong phiên */
  }
  listeners.forEach((l) => l());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, load, () => DEFAULTS);
}
