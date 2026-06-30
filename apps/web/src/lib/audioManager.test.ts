// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { AUDIO_CUES, getAudioCueDefinition } from "./audioEvents";
import {
  DEFAULT_AUDIO_SETTINGS,
  canPlayAudioCue,
  createAudioFeedbackController,
  getAudioCueVolume,
  getAudioSettingsStorageKey,
  getSavedAudioSettings,
  normalizeAudioSettings,
  saveAudioSettings,
} from "./audioManager";

afterEach(() => {
  localStorage.removeItem(getAudioSettingsStorageKey());
});

describe("audio feedback system", () => {
  it("normalizes partial settings and clamps volumes", () => {
    const settings = normalizeAudioSettings({
      muted: true,
      masterVolume: 2,
      categories: {
        ui: { enabled: false, volume: -4 },
        combat: { volume: 0.42 },
      },
    });

    expect(settings.muted).toBe(true);
    expect(settings.masterVolume).toBe(1);
    expect(settings.categories.ui.enabled).toBe(false);
    expect(settings.categories.ui.volume).toBe(0);
    expect(settings.categories.map.enabled).toBe(true);
    expect(settings.categories.combat.volume).toBe(0.42);
  });

  it("persists and restores audio preferences", () => {
    const settings = normalizeAudioSettings({
      ...DEFAULT_AUDIO_SETTINGS,
      muted: true,
      masterVolume: 0.18,
      categories: {
        ...DEFAULT_AUDIO_SETTINGS.categories,
        notification: { enabled: false, volume: 0.25 },
      },
    });

    saveAudioSettings(settings);

    const restored = getSavedAudioSettings();
    expect(restored.muted).toBe(true);
    expect(restored.masterVolume).toBe(0.18);
    expect(restored.categories.notification.enabled).toBe(false);
    expect(restored.categories.notification.volume).toBe(0.25);
  });

  it("keeps every mapped cue discoverable", () => {
    for (const cueId of Object.keys(AUDIO_CUES)) {
      expect(getAudioCueDefinition(cueId)).toMatchObject({ id: cueId });
    }
    expect(getAudioCueDefinition("unknown-cue")).toBeNull();
  });

  it("prevents muted, disabled, throttled, and unknown cues", () => {
    const muted = normalizeAudioSettings({ ...DEFAULT_AUDIO_SETTINGS, muted: true });
    const disabledUi = normalizeAudioSettings({
      ...DEFAULT_AUDIO_SETTINGS,
      categories: {
        ...DEFAULT_AUDIO_SETTINGS.categories,
        ui: { enabled: false, volume: 1 },
      },
    });

    expect(getAudioCueVolume(muted, "ui_primary")).toBe(0);
    expect(canPlayAudioCue(muted, "ui_primary", {}, 1000)).toBe(false);
    expect(canPlayAudioCue(disabledUi, "ui_primary", {}, 1000)).toBe(false);
    expect(canPlayAudioCue(DEFAULT_AUDIO_SETTINGS, "not-real", {}, 1000)).toBe(false);
    expect(canPlayAudioCue(DEFAULT_AUDIO_SETTINGS, "ui_primary", { ui_primary: 950 }, 1000)).toBe(false);
    expect(canPlayAudioCue(DEFAULT_AUDIO_SETTINGS, "ui_primary", { ui_primary: 950 }, 1000, { force: true })).toBe(true);
  });

  it("fails safely when Web Audio is unavailable", () => {
    const controller = createAudioFeedbackController({
      settings: DEFAULT_AUDIO_SETTINGS,
      audioContextFactory: null,
    });

    expect(() => controller.play("unknown-cue")).not.toThrow();
    expect(() => controller.play("ui_primary")).not.toThrow();
    expect(controller.getSnapshot()).toMatchObject({
      supported: false,
      unlocked: false,
      lastCueId: null,
    });
  });
});
