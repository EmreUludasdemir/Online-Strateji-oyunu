import { AUDIO_CUES, getAudioCueDefinition, type AudioCategory, type AudioCueId, type AudioToneStep } from "./audioEvents";

export interface AudioCategorySettings {
  enabled: boolean;
  volume: number;
}

export interface AudioSettings {
  version: number;
  enabled: boolean;
  muted: boolean;
  masterVolume: number;
  respectReducedMotion: boolean;
  categories: Record<AudioCategory, AudioCategorySettings>;
}

export interface AudioSnapshot {
  supported: boolean;
  unlocked: boolean;
  muted: boolean;
  enabled: boolean;
  masterVolume: number;
  respectReducedMotion: boolean;
  categories: Record<AudioCategory, AudioCategorySettings>;
  lastCueId: AudioCueId | null;
  lastCueAt: string | null;
}

export interface AudioFeedbackController {
  play: (cueId: AudioCueId | string, options?: { force?: boolean; volume?: number }) => void;
  unlock: () => void;
  setSettings: (settings: AudioSettings) => void;
  getSettings: () => AudioSettings;
  getSnapshot: () => AudioSnapshot;
  dispose: () => void;
}

interface AudioContextLike {
  currentTime: number;
  state?: string;
  destination: AudioNode;
  createGain: () => GainNode;
  createOscillator: () => OscillatorNode;
  resume?: () => Promise<void>;
  close?: () => Promise<void>;
}

type AudioContextFactory = () => AudioContextLike;

export const AUDIO_SETTINGS_STORAGE_KEY = "frontier_audio_settings";
export const AUDIO_SETTINGS_VERSION = 1;

const DEFAULT_CATEGORY_SETTINGS: Record<AudioCategory, AudioCategorySettings> = {
  ui: { enabled: true, volume: 0.72 },
  map: { enabled: true, volume: 0.66 },
  combat: { enabled: true, volume: 0.76 },
  notification: { enabled: true, volume: 0.58 },
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  version: AUDIO_SETTINGS_VERSION,
  enabled: true,
  muted: false,
  masterVolume: 0.32,
  respectReducedMotion: true,
  categories: DEFAULT_CATEGORY_SETTINGS,
};

function cloneSettings(settings: AudioSettings): AudioSettings {
  return {
    ...settings,
    categories: {
      ui: { ...settings.categories.ui },
      map: { ...settings.categories.map },
      combat: { ...settings.categories.combat },
      notification: { ...settings.categories.notification },
    },
  };
}

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeCategorySettings(input: unknown, fallback: AudioCategorySettings): AudioCategorySettings {
  const payload = typeof input === "object" && input !== null ? (input as Partial<AudioCategorySettings>) : {};
  return {
    enabled: typeof payload.enabled === "boolean" ? payload.enabled : fallback.enabled,
    volume: clamp01(payload.volume, fallback.volume),
  };
}

export function normalizeAudioSettings(input: unknown): AudioSettings {
  const payload = typeof input === "object" && input !== null ? (input as Partial<AudioSettings>) : {};
  const categories = typeof payload.categories === "object" && payload.categories !== null ? payload.categories : {};

  return {
    version: AUDIO_SETTINGS_VERSION,
    enabled: typeof payload.enabled === "boolean" ? payload.enabled : DEFAULT_AUDIO_SETTINGS.enabled,
    muted: typeof payload.muted === "boolean" ? payload.muted : DEFAULT_AUDIO_SETTINGS.muted,
    masterVolume: clamp01(payload.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume),
    respectReducedMotion:
      typeof payload.respectReducedMotion === "boolean"
        ? payload.respectReducedMotion
        : DEFAULT_AUDIO_SETTINGS.respectReducedMotion,
    categories: {
      ui: normalizeCategorySettings((categories as Partial<Record<AudioCategory, AudioCategorySettings>>).ui, DEFAULT_CATEGORY_SETTINGS.ui),
      map: normalizeCategorySettings((categories as Partial<Record<AudioCategory, AudioCategorySettings>>).map, DEFAULT_CATEGORY_SETTINGS.map),
      combat: normalizeCategorySettings(
        (categories as Partial<Record<AudioCategory, AudioCategorySettings>>).combat,
        DEFAULT_CATEGORY_SETTINGS.combat,
      ),
      notification: normalizeCategorySettings(
        (categories as Partial<Record<AudioCategory, AudioCategorySettings>>).notification,
        DEFAULT_CATEGORY_SETTINGS.notification,
      ),
    },
  };
}

function getDefaultStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

export function getAudioSettingsStorageKey() {
  return AUDIO_SETTINGS_STORAGE_KEY;
}

export function getSavedAudioSettings(storage = getDefaultStorage()): AudioSettings {
  if (!storage) {
    return cloneSettings(DEFAULT_AUDIO_SETTINGS);
  }

  const raw = storage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return cloneSettings(DEFAULT_AUDIO_SETTINGS);
  }

  try {
    return normalizeAudioSettings(JSON.parse(raw));
  } catch {
    return cloneSettings(DEFAULT_AUDIO_SETTINGS);
  }
}

export function saveAudioSettings(settings: AudioSettings, storage = getDefaultStorage()): void {
  if (!storage) {
    return;
  }
  storage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeAudioSettings(settings)));
}

export function shouldReduceAudioMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function getAudioCueVolume(settings: AudioSettings, cueId: string, overrideVolume?: number): number {
  const cue = getAudioCueDefinition(cueId);
  if (!cue || !settings.enabled || settings.muted) {
    return 0;
  }

  const category = settings.categories[cue.category];
  if (!category.enabled) {
    return 0;
  }

  const reducedMotionScale = settings.respectReducedMotion && shouldReduceAudioMotion() ? 0.58 : 1;
  return clamp01(settings.masterVolume * category.volume * (overrideVolume ?? 1) * reducedMotionScale, 0);
}

export function canPlayAudioCue(
  settings: AudioSettings,
  cueId: string,
  lastPlayedAt: Partial<Record<AudioCueId, number>>,
  now = Date.now(),
  options?: { force?: boolean; volume?: number },
): boolean {
  const cue = getAudioCueDefinition(cueId);
  if (!cue) {
    return false;
  }
  if (getAudioCueVolume(settings, cueId, options?.volume) <= 0) {
    return false;
  }
  if (options?.force) {
    return true;
  }
  const previous = lastPlayedAt[cue.id] ?? 0;
  return now - previous >= cue.throttleMs;
}

function getAudioContextFactory(): AudioContextFactory | null {
  if (typeof window === "undefined") {
    return null;
  }
  const contextCtor = window.AudioContext ?? window.webkitAudioContext;
  if (!contextCtor) {
    return null;
  }
  return () => new contextCtor();
}

function scheduleTone(context: AudioContextLike, master: GainNode, step: AudioToneStep, baseVolume: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime + (step.offsetMs ?? 0) / 1000;
  const duration = Math.max(0.02, step.durationMs / 1000);
  const peak = Math.max(0, baseVolume * (step.gain ?? 0.2));

  oscillator.type = step.type ?? "triangle";
  oscillator.frequency.setValueAtTime(step.frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

export function createAudioFeedbackController(options?: {
  settings?: AudioSettings;
  audioContextFactory?: AudioContextFactory | null;
}): AudioFeedbackController {
  let settings = normalizeAudioSettings(options?.settings ?? getSavedAudioSettings());
  const audioContextFactory = options?.audioContextFactory === undefined ? getAudioContextFactory() : options.audioContextFactory;
  let context: AudioContextLike | null = null;
  let masterGain: GainNode | null = null;
  let unlocked = false;
  let lastCueId: AudioCueId | null = null;
  let lastCueAt: string | null = null;
  const lastPlayedAt: Partial<Record<AudioCueId, number>> = {};

  const supported = Boolean(audioContextFactory);

  const ensureContext = () => {
    if (!audioContextFactory) {
      return null;
    }
    if (!context) {
      try {
        context = audioContextFactory();
        masterGain = context.createGain();
        masterGain.gain.value = 0.92;
        masterGain.connect(context.destination);
      } catch {
        context = null;
        masterGain = null;
        return null;
      }
    }
    return context;
  };

  const unlock = () => {
    const nextContext = ensureContext();
    if (!nextContext) {
      return;
    }
    unlocked = true;
    if (nextContext.state === "suspended" && typeof nextContext.resume === "function") {
      void nextContext.resume().catch(() => undefined);
    }
  };

  return {
    play: (cueId, playOptions) => {
      const cue = getAudioCueDefinition(cueId);
      if (!cue) {
        return;
      }

      const now = Date.now();
      if (!canPlayAudioCue(settings, cue.id, lastPlayedAt, now, playOptions)) {
        return;
      }

      unlock();
      if (!context || !masterGain || !unlocked) {
        return;
      }

      const volume = getAudioCueVolume(settings, cue.id, playOptions?.volume);
      if (volume <= 0) {
        return;
      }

      try {
        for (const step of cue.tone) {
          scheduleTone(context, masterGain, step, volume);
        }
        lastPlayedAt[cue.id] = now;
        lastCueId = cue.id;
        lastCueAt = new Date(now).toISOString();
      } catch {
        // Audio must never block gameplay.
      }
    },
    unlock,
    setSettings: (nextSettings) => {
      settings = normalizeAudioSettings(nextSettings);
      saveAudioSettings(settings);
    },
    getSettings: () => cloneSettings(settings),
    getSnapshot: () => ({
      supported,
      unlocked,
      muted: settings.muted,
      enabled: settings.enabled,
      masterVolume: settings.masterVolume,
      respectReducedMotion: settings.respectReducedMotion,
      categories: cloneSettings(settings).categories,
      lastCueId,
      lastCueAt,
    }),
    dispose: () => {
      if (context && typeof context.close === "function") {
        void context.close().catch(() => undefined);
      }
      context = null;
      masterGain = null;
      unlocked = false;
    },
  };
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
