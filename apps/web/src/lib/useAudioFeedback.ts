import { useCallback, useEffect, useMemo, useState } from "react";

import { createAudioFeedbackController, getSavedAudioSettings, normalizeAudioSettings, saveAudioSettings } from "./audioManager";
import type { AudioFeedbackController, AudioSettings, AudioSnapshot } from "./audioManager";
import type { AudioCueId } from "./audioEvents";

type AudioSettingsUpdater = AudioSettings | ((current: AudioSettings) => AudioSettings);

export interface UseAudioFeedbackResult {
  settings: AudioSettings;
  setSettings: (updater: AudioSettingsUpdater) => void;
  toggleMuted: () => void;
  play: (cueId: AudioCueId | string, options?: { force?: boolean; volume?: number }) => void;
  unlock: () => void;
  getSnapshot: () => AudioSnapshot;
}

export function useAudioFeedback(): UseAudioFeedbackResult {
  const [settings, setSettingsState] = useState<AudioSettings>(() => getSavedAudioSettings());
  const controller = useMemo<AudioFeedbackController>(() => createAudioFeedbackController({ settings }), []);

  const setSettings = useCallback(
    (updater: AudioSettingsUpdater) => {
      setSettingsState((current) => {
        const next = normalizeAudioSettings(typeof updater === "function" ? updater(current) : updater);
        controller.setSettings(next);
        saveAudioSettings(next);
        return next;
      });
    },
    [controller],
  );

  const toggleMuted = useCallback(() => {
    setSettings((current) => ({ ...current, muted: !current.muted }));
  }, [setSettings]);

  const play = useCallback<UseAudioFeedbackResult["play"]>(
    (cueId, options) => {
      controller.play(cueId, options);
    },
    [controller],
  );

  const unlock = useCallback(() => {
    controller.unlock();
  }, [controller]);

  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);

  useEffect(() => {
    controller.setSettings(settings);
  }, [controller, settings]);

  useEffect(() => {
    const unlockFromGesture = () => {
      controller.unlock();
    };

    window.addEventListener("pointerdown", unlockFromGesture, { passive: true });
    window.addEventListener("keydown", unlockFromGesture);
    return () => {
      window.removeEventListener("pointerdown", unlockFromGesture);
      window.removeEventListener("keydown", unlockFromGesture);
      controller.dispose();
    };
  }, [controller]);

  return {
    settings,
    setSettings,
    toggleMuted,
    play,
    unlock,
    getSnapshot,
  };
}
