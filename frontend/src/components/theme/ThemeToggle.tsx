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
 * A compact, always-visible Light/Dark/System control. Placed in the
 * header per FCP-01 ("a visible theme toggle in an appropriate
 * persistent UI location, preferably the header/profile/settings
 * area") — there is no profile/settings page yet (see the FCP-01
 * audit: exposing one without real content would violate the "no
 * placeholder pages" rule), so the header is the correct home for it
 * today.
 */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div className={styles.group} role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const active = preference === id;
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
