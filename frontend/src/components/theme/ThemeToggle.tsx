"use client";

import { SunIcon, MoonIcon, MonitorIcon } from "@/components/ui/icons";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemePreference } from "@/lib/theme/theme";
import styles from "./ThemeToggle.module.css";

const OPTIONS: { id: ThemePreference; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }[] = [
  { id: "light", label: "Light theme", icon: SunIcon },
  { id: "dark", label: "Dark theme", icon: MoonIcon },
  { id: "system", label: "Match system theme", icon: MonitorIcon },
];

/**
 * A compact, always-visible Light/Dark/System control, placed in the
 * header per FCP-01 ("a visible theme toggle in an appropriate
 * persistent UI location, preferably the header/profile/settings
 * area"). FCP-03 later added a full Settings page with its own
 * labelled instance of this same control (see SettingsSection.tsx) —
 * both are kept intentionally: this one for always-visible access
 * from any screen, the Settings one alongside the app's other
 * preferences.
 *
 * Renders a neutral state (no option marked active) until
 * `ThemeProvider` reports `mounted`, i.e. until the real stored
 * preference has actually been read on the client. This is what
 * keeps the server-rendered and first-client-rendered markup
 * identical (see the hydration-fix note in `ThemeProvider.tsx`) —
 * rendering as if "System" (or any other guess) were already the
 * confirmed answer before we know that is exactly what caused the
 * original hydration mismatch.
 */
export function ThemeToggle() {
  const { preference, mounted, setPreference } = useTheme();

  return (
    <div className={styles.group} role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const active = mounted && preference === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            className={`${styles.option} ${active ? styles.optionActive : ""}`}
            onClick={() => setPreference(id)}
          >
            <Icon width={15} height={15} />
          </button>
        );
      })}
    </div>
  );
}
