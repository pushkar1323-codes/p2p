"use client";

/**
 * Theme context/provider (FCP-01, hydration fix).
 *
 * Owns the live `ThemePreference` + resolved `Theme`, applies the
 * resolved theme to `<html data-theme>` (which `globals.css` keys all
 * dark-mode token overrides off), and keeps everything in sync with:
 *  - the value already set by the blocking inline script in
 *    `layout.tsx` (so there's no flash of the wrong theme), and
 *  - live OS `prefers-color-scheme` changes while "system" is active.
 *
 * All the actual decision logic (what "system" resolves to, how a
 * stored value is validated) lives in the framework-free
 * `lib/theme/theme.ts` module and is unit tested there; this file is
 * intentionally a thin DOM/React binding on top of it.
 *
 * --- Hydration fix -----------------------------------------------
 * The original version of this file initialized `preference` (and
 * `systemPrefersDark`) by reading `localStorage`/`matchMedia` in the
 * `useState` initializer itself. That function runs during *every*
 * render pass that mounts the component — including the server
 * render (where `window` doesn't exist, so it fell back to
 * `"system"`/`false`) *and* the first client render during hydration
 * (where `window` exists, so it read the real stored value, e.g.
 * `"dark"`). Server and first-client output therefore disagreed
 * whenever the user's stored preference wasn't `"system"`, and any
 * component reading `preference`/`theme` from context (`ThemeToggle`'s
 * `aria-checked`/active class) rendered differently on each side —
 * exactly the reported mismatch.
 *
 * The fix: the first render, on *both* server and client, now always
 * uses the same deterministic placeholder (`preference = "system"`,
 * `systemPrefersDark = false`, `mounted = false`) — no `window`/
 * `localStorage`/`matchMedia` access happens during render at all,
 * only inside `useEffect`, which never runs during SSR and only runs
 * on the client *after* hydration has already completed. That effect
 * then reveals the real values and flips `mounted` to `true`.
 * `ThemeToggle` uses `mounted` to render a neutral (nothing-selected)
 * state until then, rather than asserting an unverified preference.
 *
 * This does not reintroduce a color flash: the blocking script in
 * `layout.tsx` already sets the *correct* `data-theme` attribute
 * before first paint, directly on the DOM, entirely outside React.
 * The DOM-sync effect below is deliberately gated on `mounted` so it
 * never writes the deterministic placeholder theme over that correct
 * value — it only re-applies `data-theme` once it has the real
 * preference, at which point it recomputes to the same value the
 * script already set (a harmless no-op write), never an intermediate
 * wrong one.
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
  /**
   * `false` until the real stored preference/OS setting has been
   * read on the client (post-hydration). `preference`/`theme` hold a
   * deterministic placeholder until then — consumers that render
   * preference-dependent UI (e.g. `ThemeToggle`'s active option)
   * should treat `mounted === false` as "not yet known" rather than
   * displaying the placeholder as if it were the real answer.
   */
  mounted: boolean;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Deterministic placeholder used for the very first render on both server and client. */
const PLACEHOLDER_PREFERENCE: ThemePreference = "system";
const PLACEHOLDER_SYSTEM_PREFERS_DARK = false;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(PLACEHOLDER_PREFERENCE);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    PLACEHOLDER_SYSTEM_PREFERS_DARK
  );
  const [mounted, setMounted] = useState(false);

  // Runs once, client-only, strictly after hydration has completed —
  // this is what actually reads the real stored preference and OS
  // setting, and it's also where the live-OS-change listener is
  // attached (so "system" keeps tracking prefers-color-scheme without
  // a reload).
  useEffect(() => {
    const supportsMatchMedia = typeof window.matchMedia === "function";
    const mql = supportsMatchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    // setState is deferred (rather than called synchronously in the
    // effect body) per the react-hooks/set-state-in-effect rule —
    // same established pattern as LoanLookup.tsx's `syncSignal`
    // effect. This still reveals the real preference within the same
    // tick for the user, just not as a same-render cascading update.
    const revealTimer = setTimeout(() => {
      setPreferenceState(readStoredThemePreference(window.localStorage));
      setSystemPrefersDark(mql ? mql.matches : false);
      setMounted(true);
    }, 0);

    if (!mql) {
      return () => clearTimeout(revealTimer);
    }

    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    mql.addEventListener("change", handleChange);
    return () => {
      clearTimeout(revealTimer);
      mql.removeEventListener("change", handleChange);
    };
  }, []);

  const theme = useMemo(
    () => resolveTheme(preference, systemPrefersDark),
    [preference, systemPrefersDark]
  );

  // Keep <html data-theme="..."> in sync with the resolved theme —
  // but only once `mounted`, i.e. only once `theme` reflects the real
  // preference. Before that, the blocking inline script in
  // layout.tsx has already applied the correct value directly to the
  // DOM; running this effect against the placeholder theme first
  // would overwrite that correct value with a wrong one (a second,
  // React-caused flash), so it's a no-op until `mounted`.
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme, mounted]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeStoredThemePreference(window.localStorage, next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, mounted, setPreference }),
    [preference, theme, mounted, setPreference]
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
