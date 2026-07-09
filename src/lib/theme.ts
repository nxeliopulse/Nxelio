export type Theme = "light" | "dark" | "system";

/** Reads the saved preference (defaults to following the OS). */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const t = localStorage.getItem("theme");
  return t === "light" || t === "dark" || t === "system" ? t : "system";
}

/** Persists the preference and toggles the `.dark` class on <html>. */
export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  localStorage.setItem("theme", theme);
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
