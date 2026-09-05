"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { SettingsIcon, SunIcon, MoonIcon, MonitorIcon } from "@/components/ui/icons";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemePreference } from "@/lib/theme/theme";
import styles from "./SettingsSection.module.css";

const OPTIONS: {
  id: ThemePreference;
  label: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}[] = [
  { id: "light", label: "Light", description: "Always use the light theme.", icon: SunIcon },
  { id: "dark", label: "Dark", description: "Always use the dark theme.", icon: MoonIcon },
  { id: "system", label: "System", description: "Match your device's setting.", icon: MonitorIcon },
];

/**
 * Settings — deliberately minimal. Theme is the one real,
 * user-controllable preference this application currently has (same
 * `ThemeProvider`/`ThemeToggle` mechanism as the header, just with
 * full labels here). Per FCP-03's own rule ("do not add controls
 * that have no effect"), nothing else is added — there's no
 * notification delivery mechanism, no user/session/profile system,
 * and no other real per-user preference to control yet.
 */
export function SettingsSection() {
  const { preference, mounted, setPreference } = useTheme();

  return (
    <Card>
      <CardHeader icon={<SettingsIcon width={18} height={18} />} title="Settings" description="Application preferences." />

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Appearance</h3>
        <div className={styles.optionsGrid} role="radiogroup" aria-label="Theme">
          {OPTIONS.map(({ id, label, description, icon: Icon }) => {
            const active = mounted && preference === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`${styles.option} ${active ? styles.optionActive : ""}`}
                onClick={() => setPreference(id)}
              >
                <Icon width={18} height={18} />
                <span className={styles.optionLabel}>{label}</span>
                <span className={styles.optionDescription}>{description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className={styles.hint}>
        No other user-configurable settings exist yet — this application doesn&apos;t have notification
        delivery, a user profile/session system, or other preferences that would meaningfully do
        anything if added here.
      </p>
    </Card>
  );
}
