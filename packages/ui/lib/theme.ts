export const THEME_STORAGE_KEY = "elio-theme";

export type ThemeMode = "light" | "dark" | "system";

export function isDarkModeActive(): boolean {
  if (typeof document === "undefined") return false;
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  if (mode === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    return;
  }
  if (mode === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    return;
  }
  document.documentElement.removeAttribute("data-theme");
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // localStorage may be blocked in private browsing.
  }
  return "system";
}

export function storeTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Ignore quota / privacy errors.
  }
}

/** Inline script to apply stored theme before first paint (prevents flash). */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem("${THEME_STORAGE_KEY}");if(m==="light"||m==="dark"){document.documentElement.setAttribute("data-theme",m);}else{document.documentElement.removeAttribute("data-theme");}}catch(e){}})();`;
