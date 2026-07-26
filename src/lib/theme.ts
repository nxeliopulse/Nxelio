export type Theme = "light" | "dark" | "system";
export type FontSize = "default" | "compact" | "large" | "xl";
export type FontStyle = "sans" | "inter" | "roboto" | "outfit" | "serif" | "mono" | "rounded";
export type LightPreset = "light" | "warm" | "slate";
export type DarkPreset = "dark" | "midnight" | "obsidian" | "emerald";
export type AccentColor = "blue" | "indigo" | "purple" | "emerald" | "rose" | "amber" | "teal" | "black";
export type SidebarBadgeStyle = "default" | "numeric" | "dot" | "hidden";
export type SidebarDensity = "default" | "compact";

export interface AppearanceSettings {
  theme: Theme;
  fontSize: FontSize;
  fontStyle: FontStyle;
  pointerCursors: boolean;
  underlineLinks: boolean;
  lightPreset: LightPreset;
  darkPreset: DarkPreset;
  accentColor: AccentColor;
  sidebarBadgeStyle: SidebarBadgeStyle;
  sidebarDensity: SidebarDensity;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: "system",
  fontSize: "default",
  fontStyle: "sans",
  pointerCursors: true,
  underlineLinks: false,
  lightPreset: "light",
  darkPreset: "dark",
  accentColor: "teal",
  sidebarBadgeStyle: "default",
  sidebarDensity: "default",
};

/** Reads the saved appearance preferences from localStorage. */
export function getStoredAppearance(): AppearanceSettings {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = localStorage.getItem("nxelio_appearance");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_APPEARANCE, ...parsed };
    }
    const legacyTheme = localStorage.getItem("theme") as Theme | null;
    if (legacyTheme) {
      return { ...DEFAULT_APPEARANCE, theme: legacyTheme };
    }
  } catch {
    // fallback to defaults
  }
  return DEFAULT_APPEARANCE;
}

/** Legacy helper for single theme query */
export function getStoredTheme(): Theme {
  return getStoredAppearance().theme;
}

/** Persists and applies appearance settings on the HTML root element. */
export function applyAppearance(settings: AppearanceSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("nxelio_appearance", JSON.stringify(settings));
    localStorage.setItem("theme", settings.theme);
  } catch {
    // ignore
  }

  const root = document.documentElement;
  const isDark =
    settings.theme === "dark" ||
    (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  root.classList.toggle("dark", isDark);
  root.setAttribute("data-font-size", settings.fontSize || "default");
  root.setAttribute("data-font-style", settings.fontStyle || "sans");
  root.setAttribute("data-pointer-cursors", settings.pointerCursors ? "true" : "false");
  root.setAttribute("data-underline-links", settings.underlineLinks ? "true" : "false");
  root.setAttribute("data-light-preset", settings.lightPreset || "light");
  root.setAttribute("data-dark-preset", settings.darkPreset || "dark");
  root.setAttribute("data-accent-color", settings.accentColor || "teal");
  root.setAttribute("data-sidebar-badge", settings.sidebarBadgeStyle || "default");
  root.setAttribute("data-sidebar-density", settings.sidebarDensity || "default");
}

/** Legacy helper for simple theme toggling */
export function applyTheme(theme: Theme) {
  const current = getStoredAppearance();
  const updated = { ...current, theme };
  applyAppearance(updated);
}
