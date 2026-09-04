import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export const metadata: Metadata = {
  title: "P2P — Peer-to-peer lending, powered by Stellar.",
  description:
    "P2P is a peer-to-peer lending application built on Stellar and Soroban.",
};

/**
 * Sets `<html data-theme="...">` synchronously, before first paint,
 * so there is no flash of the wrong theme on load and no visible
 * re-render once React hydrates.
 *
 * This intentionally duplicates (rather than imports) the small bit
 * of resolution logic in `lib/theme/theme.ts` — a plain, blocking
 * `<script>` in `<head>` cannot use ES module imports and must not
 * depend on the app bundle at all, since it has to run before any of
 * that has loaded. `ThemeProvider` performs the same resolution
 * (and is unit tested via `lib/theme/theme.ts`) once React mounts,
 * so this script only ever needs to get the *first* paint right.
 * Wrapped in try/catch: `localStorage`/`matchMedia` access can throw
 * in some private-browsing configurations, and a failure here must
 * never block the page from rendering — it just falls back to light.
 */
const THEME_INIT_SCRIPT = `(function () {
  try {
    var KEY = "p2p-theme-preference";
    var stored = window.localStorage.getItem(KEY);
    var preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
