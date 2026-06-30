export type AudioCategory = "ui" | "map" | "combat" | "notification";

export type AudioCueId =
  | "ui_primary"
  | "ui_secondary"
  | "ui_error"
  | "panel_open"
  | "panel_close"
  | "tab_switch"
  | "tutorial_start"
  | "tutorial_step_completed"
  | "tutorial_chapter_completed"
  | "tutorial_skipped"
  | "tutorial_completed"
  | "upgrade_started"
  | "upgrade_completed"
  | "training_started"
  | "training_completed"
  | "research_started"
  | "research_completed"
  | "province_selected"
  | "province_scouted"
  | "influence_established"
  | "claim_created"
  | "diplomacy_action"
  | "raid_prepared"
  | "march_sent"
  | "march_arrived"
  | "battle_report_received"
  | "victory"
  | "defeat"
  | "resource_gained"
  | "warning"
  | "map_mode_changed"
  | "realm_dossier_opened"
  | "field_command_opened";

export interface AudioToneStep {
  frequency: number;
  durationMs: number;
  offsetMs?: number;
  gain?: number;
  type?: OscillatorType;
}

export interface AudioCueDefinition {
  id: AudioCueId;
  category: AudioCategory;
  label: string;
  throttleMs: number;
  tone: readonly AudioToneStep[];
}

const tap: readonly AudioToneStep[] = [
  { frequency: 196, durationMs: 42, gain: 0.32, type: "triangle" },
  { frequency: 294, durationMs: 54, offsetMs: 32, gain: 0.22, type: "sine" },
];

export const AUDIO_CUES: Record<AudioCueId, AudioCueDefinition> = {
  ui_primary: { id: "ui_primary", category: "ui", label: "Primary command tap", throttleMs: 90, tone: tap },
  ui_secondary: {
    id: "ui_secondary",
    category: "ui",
    label: "Secondary parchment tap",
    throttleMs: 90,
    tone: [{ frequency: 176, durationMs: 52, gain: 0.22, type: "triangle" }],
  },
  ui_error: {
    id: "ui_error",
    category: "ui",
    label: "Blocked muted thud",
    throttleMs: 180,
    tone: [
      { frequency: 118, durationMs: 72, gain: 0.34, type: "sine" },
      { frequency: 82, durationMs: 90, offsetMs: 54, gain: 0.18, type: "sine" },
    ],
  },
  panel_open: {
    id: "panel_open",
    category: "ui",
    label: "Panel leather open",
    throttleMs: 120,
    tone: [
      { frequency: 164, durationMs: 58, gain: 0.2, type: "triangle" },
      { frequency: 246, durationMs: 76, offsetMs: 40, gain: 0.18, type: "sine" },
    ],
  },
  panel_close: {
    id: "panel_close",
    category: "ui",
    label: "Panel close",
    throttleMs: 120,
    tone: [{ frequency: 142, durationMs: 72, gain: 0.18, type: "triangle" }],
  },
  tab_switch: {
    id: "tab_switch",
    category: "ui",
    label: "Ledger tab switch",
    throttleMs: 110,
    tone: [{ frequency: 220, durationMs: 46, gain: 0.2, type: "triangle" }],
  },
  tutorial_start: {
    id: "tutorial_start",
    category: "notification",
    label: "Divan guide start",
    throttleMs: 400,
    tone: [
      { frequency: 196, durationMs: 70, gain: 0.18, type: "triangle" },
      { frequency: 330, durationMs: 90, offsetMs: 68, gain: 0.14, type: "sine" },
    ],
  },
  tutorial_step_completed: {
    id: "tutorial_step_completed",
    category: "notification",
    label: "Tutorial step seal",
    throttleMs: 260,
    tone: [
      { frequency: 220, durationMs: 62, gain: 0.16, type: "triangle" },
      { frequency: 330, durationMs: 72, offsetMs: 62, gain: 0.12, type: "sine" },
    ],
  },
  tutorial_chapter_completed: {
    id: "tutorial_chapter_completed",
    category: "notification",
    label: "Tutorial chapter seal",
    throttleMs: 500,
    tone: [
      { frequency: 196, durationMs: 70, gain: 0.16, type: "triangle" },
      { frequency: 294, durationMs: 80, offsetMs: 64, gain: 0.14, type: "triangle" },
      { frequency: 392, durationMs: 100, offsetMs: 130, gain: 0.1, type: "sine" },
    ],
  },
  tutorial_skipped: {
    id: "tutorial_skipped",
    category: "notification",
    label: "Tutorial dismissed",
    throttleMs: 300,
    tone: [{ frequency: 148, durationMs: 90, gain: 0.16, type: "triangle" }],
  },
  tutorial_completed: {
    id: "tutorial_completed",
    category: "notification",
    label: "Tutorial completed",
    throttleMs: 700,
    tone: [
      { frequency: 196, durationMs: 92, gain: 0.18, type: "triangle" },
      { frequency: 294, durationMs: 110, offsetMs: 88, gain: 0.14, type: "triangle" },
      { frequency: 440, durationMs: 140, offsetMs: 174, gain: 0.1, type: "sine" },
    ],
  },
  upgrade_started: {
    id: "upgrade_started",
    category: "ui",
    label: "Stone hammer tap",
    throttleMs: 260,
    tone: [
      { frequency: 128, durationMs: 52, gain: 0.3, type: "triangle" },
      { frequency: 220, durationMs: 60, offsetMs: 42, gain: 0.18, type: "sine" },
    ],
  },
  upgrade_completed: {
    id: "upgrade_completed",
    category: "notification",
    label: "Upgrade completed brass",
    throttleMs: 700,
    tone: [
      { frequency: 196, durationMs: 90, gain: 0.16, type: "triangle" },
      { frequency: 330, durationMs: 110, offsetMs: 90, gain: 0.12, type: "sine" },
    ],
  },
  training_started: {
    id: "training_started",
    category: "ui",
    label: "Muted training drum",
    throttleMs: 240,
    tone: [
      { frequency: 92, durationMs: 64, gain: 0.28, type: "sine" },
      { frequency: 116, durationMs: 56, offsetMs: 78, gain: 0.2, type: "sine" },
    ],
  },
  training_completed: {
    id: "training_completed",
    category: "notification",
    label: "Formation ready",
    throttleMs: 650,
    tone: [
      { frequency: 146, durationMs: 74, gain: 0.18, type: "triangle" },
      { frequency: 220, durationMs: 90, offsetMs: 74, gain: 0.12, type: "triangle" },
    ],
  },
  research_started: {
    id: "research_started",
    category: "ui",
    label: "Scholar seal",
    throttleMs: 240,
    tone: [
      { frequency: 246, durationMs: 68, gain: 0.14, type: "sine" },
      { frequency: 196, durationMs: 68, offsetMs: 54, gain: 0.12, type: "triangle" },
    ],
  },
  research_completed: {
    id: "research_completed",
    category: "notification",
    label: "Doctrine completed",
    throttleMs: 700,
    tone: [
      { frequency: 220, durationMs: 80, gain: 0.14, type: "triangle" },
      { frequency: 370, durationMs: 120, offsetMs: 78, gain: 0.1, type: "sine" },
    ],
  },
  province_selected: {
    id: "province_selected",
    category: "map",
    label: "Province parchment select",
    throttleMs: 110,
    tone: [{ frequency: 184, durationMs: 48, gain: 0.16, type: "triangle" }],
  },
  province_scouted: {
    id: "province_scouted",
    category: "map",
    label: "Scout dispatch",
    throttleMs: 280,
    tone: [
      { frequency: 128, durationMs: 54, gain: 0.2, type: "sine" },
      { frequency: 196, durationMs: 68, offsetMs: 64, gain: 0.12, type: "triangle" },
    ],
  },
  influence_established: {
    id: "influence_established",
    category: "map",
    label: "Influence seal",
    throttleMs: 320,
    tone: [
      { frequency: 174, durationMs: 62, gain: 0.16, type: "triangle" },
      { frequency: 261, durationMs: 78, offsetMs: 62, gain: 0.12, type: "sine" },
    ],
  },
  claim_created: {
    id: "claim_created",
    category: "map",
    label: "Claim stamp",
    throttleMs: 320,
    tone: [
      { frequency: 112, durationMs: 60, gain: 0.26, type: "triangle" },
      { frequency: 174, durationMs: 82, offsetMs: 62, gain: 0.14, type: "sine" },
    ],
  },
  diplomacy_action: {
    id: "diplomacy_action",
    category: "map",
    label: "Diplomacy chime seal",
    throttleMs: 260,
    tone: [
      { frequency: 246, durationMs: 70, gain: 0.12, type: "sine" },
      { frequency: 329, durationMs: 80, offsetMs: 70, gain: 0.09, type: "sine" },
    ],
  },
  raid_prepared: {
    id: "raid_prepared",
    category: "combat",
    label: "Raid preparation drum",
    throttleMs: 340,
    tone: [
      { frequency: 86, durationMs: 70, gain: 0.28, type: "sine" },
      { frequency: 118, durationMs: 74, offsetMs: 84, gain: 0.18, type: "sine" },
    ],
  },
  march_sent: {
    id: "march_sent",
    category: "map",
    label: "March drum",
    throttleMs: 300,
    tone: [
      { frequency: 82, durationMs: 64, gain: 0.28, type: "sine" },
      { frequency: 164, durationMs: 80, offsetMs: 84, gain: 0.12, type: "triangle" },
    ],
  },
  march_arrived: {
    id: "march_arrived",
    category: "notification",
    label: "March arrived",
    throttleMs: 700,
    tone: [
      { frequency: 146, durationMs: 70, gain: 0.16, type: "triangle" },
      { frequency: 220, durationMs: 90, offsetMs: 76, gain: 0.12, type: "sine" },
    ],
  },
  battle_report_received: {
    id: "battle_report_received",
    category: "combat",
    label: "Report seal received",
    throttleMs: 700,
    tone: [
      { frequency: 122, durationMs: 68, gain: 0.2, type: "triangle" },
      { frequency: 184, durationMs: 84, offsetMs: 72, gain: 0.12, type: "sine" },
    ],
  },
  victory: {
    id: "victory",
    category: "combat",
    label: "Restrained brass victory",
    throttleMs: 900,
    tone: [
      { frequency: 196, durationMs: 92, gain: 0.18, type: "triangle" },
      { frequency: 294, durationMs: 120, offsetMs: 88, gain: 0.13, type: "triangle" },
      { frequency: 392, durationMs: 150, offsetMs: 178, gain: 0.1, type: "sine" },
    ],
  },
  defeat: {
    id: "defeat",
    category: "combat",
    label: "Low warning defeat",
    throttleMs: 900,
    tone: [
      { frequency: 112, durationMs: 110, gain: 0.22, type: "sine" },
      { frequency: 78, durationMs: 130, offsetMs: 98, gain: 0.16, type: "sine" },
    ],
  },
  resource_gained: {
    id: "resource_gained",
    category: "notification",
    label: "Resource pouch",
    throttleMs: 480,
    tone: [
      { frequency: 220, durationMs: 48, gain: 0.12, type: "triangle" },
      { frequency: 277, durationMs: 58, offsetMs: 44, gain: 0.1, type: "sine" },
    ],
  },
  warning: {
    id: "warning",
    category: "notification",
    label: "Soft warning drum",
    throttleMs: 420,
    tone: [{ frequency: 104, durationMs: 120, gain: 0.2, type: "sine" }],
  },
  map_mode_changed: {
    id: "map_mode_changed",
    category: "map",
    label: "Map lens switch",
    throttleMs: 140,
    tone: [
      { frequency: 184, durationMs: 42, gain: 0.14, type: "triangle" },
      { frequency: 246, durationMs: 50, offsetMs: 42, gain: 0.1, type: "sine" },
    ],
  },
  realm_dossier_opened: {
    id: "realm_dossier_opened",
    category: "map",
    label: "Realm dossier open",
    throttleMs: 260,
    tone: [
      { frequency: 196, durationMs: 62, gain: 0.12, type: "triangle" },
      { frequency: 294, durationMs: 76, offsetMs: 62, gain: 0.09, type: "sine" },
    ],
  },
  field_command_opened: {
    id: "field_command_opened",
    category: "map",
    label: "Field command open",
    throttleMs: 180,
    tone: [
      { frequency: 138, durationMs: 54, gain: 0.18, type: "triangle" },
      { frequency: 184, durationMs: 66, offsetMs: 54, gain: 0.1, type: "sine" },
    ],
  },
};

export function getAudioCueDefinition(cueId: AudioCueId): AudioCueDefinition;
export function getAudioCueDefinition(cueId: string): AudioCueDefinition | null;
export function getAudioCueDefinition(cueId: string): AudioCueDefinition | null {
  return Object.prototype.hasOwnProperty.call(AUDIO_CUES, cueId) ? AUDIO_CUES[cueId as AudioCueId] : null;
}

export function getExpansionAudioCue(action: string): AudioCueId {
  if (action === "SCOUT_PROVINCE") return "province_scouted";
  if (action === "ESTABLISH_INFLUENCE" || action === "FORTIFY_BORDER" || action === "MANAGE_PROVINCE") {
    return "influence_established";
  }
  if (action === "CLAIM_PROVINCE" || action === "DEMAND_SUBMISSION") return "claim_created";
  if (action === "PREPARE_RAID" || action === "LAUNCH_RAID") return "raid_prepared";
  if (action === "WITHDRAW_CLAIM") return "panel_close";
  return "diplomacy_action";
}
