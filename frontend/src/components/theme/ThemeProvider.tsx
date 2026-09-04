"use client";

/**
 * Theme context/provider (FCP-01).
 *
 * Owns the live `ThemePreference` + resolved `Theme`, applies the
 * resolved theme to `<html data-theme>` (which `globals.css` keys all
 * dark-mode token overrides off), and keeps everything in sync with:
 *  - the value already set by the blocking inline script in
 *    `layout.tsx` (so there's no flash of the wrong theme, and no
 *    visible re-render when this provider mounts), and
 *  - live OS `prefers-color-scheme` changes while "system" is active.
 *
 * All the actual decision logic (what "system" resolves to, how a
 * stored value is validated) lives in the framework-free
 * `lib/theme/theme.ts` module and is unit tested there; this file is
 * intentionally a thin DOM/React binding on top of it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  resolveTheme,
  readStoredThemePreference,
  writeStoredThemePreference,
  type Theme,
  type ThemePreference,
} from "@/lib/theme/theme";

interface ThemeContextValue {
  /** The user's raw choice: "light" | "dark" | "system". */
  preference: ThemePreference;
  /** The actual applied appearance ("system" already resolved). */
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  return readStoredThemePreference(window.localStorage);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy initializers: on the server (or before hydration) these read
  // as "system"/false, matching the blocking script's own default
  // fallback; on the client they immediately read the real stored
  // value. Either way ThemeProvider renders no DOM of its own, so
  // there is nothing for this to mismatch during hydration.
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredPreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(getSystemPrefersDark);

  // Track live OS theme changes so "system" stays correct without a reload.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const theme = useMemo(
    () => resolveTheme(preference, systemPrefersDark),
    [preference, systemPrefersDark]
  );

  // Keep <html data-theme="..."> (the CSS hook for every dark-mode
  // token override) in sync with the resolved theme. This is a DOM
  // side effect, not React state, so it's safe to run on every
  // change without tripping the "don't setState synchronously in an
  // effect" rule this codebase otherwise follows.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeStoredThemePreference(typeof window === "undefined" ? null : window.localStorage, next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
