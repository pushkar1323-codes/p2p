import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isThemePreference,
  readStoredThemePreference,
  resolveTheme,
  writeStoredThemePreference,
  THEME_STORAGE_KEY,
} from "./theme.ts";

test("isThemePreference accepts light, dark, and system", () => {
  assert.equal(isThemePreference("light"), true);
  assert.equal(isThemePreference("dark"), true);
  assert.equal(isThemePreference("system"), true);
});

test("isThemePreference rejects unrecognized values", () => {
  assert.equal(isThemePreference("neon"), false);
  assert.equal(isThemePreference(""), false);
  assert.equal(isThemePreference(null), false);
  assert.equal(isThemePreference(undefined), false);
  assert.equal(isThemePreference(42), false);
});

test("resolveTheme returns light/dark unchanged", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("dark", true), "dark");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("resolveTheme defers to systemPrefersDark for 'system'", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
}

test("readStoredThemePreference defaults to system when nothing stored", () => {
  assert.equal(readStoredThemePreference(fakeStorage()), "system");
});

test("readStoredThemePreference defaults to system when storage is null/undefined", () => {
  assert.equal(readStoredThemePreference(null), "system");
  assert.equal(readStoredThemePreference(undefined), "system");
});

test("readStoredThemePreference returns a valid stored preference", () => {
  assert.equal(
    readStoredThemePreference(fakeStorage({ [THEME_STORAGE_KEY]: "dark" })),
    "dark"
  );
});

test("readStoredThemePreference falls back to system for an unrecognized stored value", () => {
  assert.equal(
    readStoredThemePreference(fakeStorage({ [THEME_STORAGE_KEY]: "solarized" })),
    "system"
  );
});

test("readStoredThemePreference falls back to system when getItem throws", () => {
  const storage: Pick<Storage, "getItem"> = {
    getItem: () => {
      throw new Error("storage disabled");
    },
  };
  assert.equal(readStoredThemePreference(storage), "system");
});

test("writeStoredThemePreference stores the preference", () => {
  const storage = fakeStorage();
  writeStoredThemePreference(storage, "dark");
  assert.equal(storage.getItem(THEME_STORAGE_KEY), "dark");
});

test("writeStoredThemePreference does not throw when storage is null/undefined", () => {
  assert.doesNotThrow(() => writeStoredThemePreference(null, "light"));
  assert.doesNotThrow(() => writeStoredThemePreference(undefined, "light"));
});

test("writeStoredThemePreference does not throw when setItem throws", () => {
  const storage: Pick<Storage, "setItem"> = {
    setItem: () => {
      throw new Error("quota exceeded");
    },
  };
  assert.doesNotThrow(() => writeStoredThemePreference(storage, "dark"));
});
