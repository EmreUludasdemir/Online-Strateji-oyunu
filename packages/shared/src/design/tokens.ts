export const frontierColors = {
  parchmentYellow: "#f4d79c",
  brass: "#c69244",
  copper: "#a25f3c",
  iznikBlue: "#4b8fcb",
  imperialTeal: "#4b9ea0",
  emberRed: "#d4644f",
  nightCanvas: "#130a07",
  dayCanvas: "#f7efe1",
  highContrastCanvas: "#050505",
  inkDark: "#1e100a",
  inkLight: "#f7efe1",
} as const;

export const frontierFonts = {
  display: "Cinzel, Baskerville Old Face, Palatino Linotype, Book Antiqua, Georgia, serif",
  body: "Inter, Segoe UI, Noto Sans, Trebuchet MS, Helvetica Neue, Arial, sans-serif",
  mono: "Cascadia Mono, Consolas, Courier New, monospace",
} as const;

export const frontierSpacing = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
} as const;

export const frontierRadii = {
  xs: "12px",
  sm: "18px",
  md: "24px",
  lg: "30px",
  pill: "999px",
} as const;

export const frontierThemes = {
  day: {
    background: "#f7efe1",
    surface: "#ead7bc",
    text: "#1e100a",
    accent: frontierColors.iznikBlue,
  },
  night: {
    background: frontierColors.nightCanvas,
    surface: "#24120c",
    text: frontierColors.inkLight,
    accent: frontierColors.brass,
  },
  highContrast: {
    background: frontierColors.highContrastCanvas,
    surface: "#111111",
    text: "#ffffff",
    accent: "#7dd3fc",
  },
} as const;

export type FrontierThemeMode = keyof typeof frontierThemes;
