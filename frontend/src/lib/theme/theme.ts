/**
 * Theme preference: pure logic (FCP-01).
 *
 * The product supports three user-facing choices — "light", "dark",
 * and "system" (follow the OS preference) — but the DOM only ever has
 * two actual appearances. `resolveTheme` is the single place that
 * turns a preference plus the current OS preference into the one
 * `Theme` value that gets applied as `data-theme` on `<html>`.
 *
 * Deliberately has zero DOM/`window`/`localStorage` access, so it is
 * directly unit-testable without a browser — same convention as
 * `loanRegistryErrors.ts`'s pure classifiers and
 * `contractWriteFeedback.ts`'s pure status adapter. The
 * `localStorage`-touching code lives in `useTheme.ts` instead, and is
 * intentionally thin (matches this project's "network I/O / DOM
 * effects are not directly unit tested" pattern).
 */

export type Theme = "light" | "dark";
export type ThemePreference = "light" | "dark" | "system";

/** The `localStorage` key the user's chosen preference is persisted under. */
export const THEME_STORAGE_KEY = "p2p-theme-preference";

const VALID_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

/** Narrows an arbitrary value (e.g. read from `localStorage`) to a `ThemePreference`. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (VALID_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Resolves a user preference into the actual `Theme` to apply.
 * `"system"` defers to `systemPrefersDark` (the OS/browser's own
 * `prefers-color-scheme: dark` media query result) — everything else
 * is a direct, explicit choice.
 */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
}

/**
 * Reads a stored theme preference from a `Storage`-like object
 * (typically `window.localStorage`), defaulting to `"system"` when
 * nothing is stored yet or the stored value isn't recognized (e.g. an
 * older/foreign value). Never throws — a `Storage` read/parse failure
 * (private browsing mode, corrupted value, etc.) is treated the same
 * as "nothing stored".
 */
export function readStoredThemePreference(
  storage: Pick<Storage, "getItem"> | null | undefined
): ThemePreference {
  if (!storage) return "system";
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

/**
 * Persists a theme preference to a `Storage`-like object. Never
 * throws — a write failure (storage disabled/full) is silently
 * ignored; the in-memory preference (and thus the applied theme)
 * still works for the current session either way.
 */
export function writeStoredThemePreference(
  storage: Pick<Storage, "setItem"> | null | undefined,
  preference: ThemePreference
): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignored — see doc comment above.
  }
}
