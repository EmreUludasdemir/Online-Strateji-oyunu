export const frontierColors = {
  parchmentYellow: "#e2c275",
  brass: "#b58d22",
  copper: "#965a3b",
  iznikBlue: "#598bc0",
  imperialTeal: "#51a3a1",
  emberRed: "#d86851",
  nightCanvas: "#0a0a0c",
  dayCanvas: "#f7efe1",
  highContrastCanvas: "#050505",
  inkDark: "#101012",
  inkLight: "#f4f4f5",
} as const;

export const frontierFonts = {
  display: "Playfair Display, Cinzel, Cormorant Garamond, Baskerville Old Face, Palatino Linotype, Georgia, serif",
  body: "Inter, Segoe UI, Noto Sans, Helvetica Neue, Arial, sans-serif",
  mono: "JetBrains Mono, Cascadia Mono, Consolas, Courier New, monospace",
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
  xs: "10px",
  sm: "16px",
  md: "24px",
  lg: "32px",
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
    surface: "#161618",
    text: frontierColors.inkLight,
    accent: frontierColors.parchmentYellow,
  },
  highContrast: {
    background: frontierColors.highContrastCanvas,
    surface: "#111111",
    text: "#ffffff",
    accent: "#7dd3fc",
  },
} as const;

export type FrontierThemeMode = keyof typeof frontierThemes;
