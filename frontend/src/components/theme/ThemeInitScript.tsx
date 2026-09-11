"use client";

import { useServerInsertedHTML } from "next/navigation";

/**
 * Sets `<html data-theme="...">` synchronously, before first paint,
 * so there is no flash of the wrong theme on load and no visible
 * re-render once React hydrates.
 *
 * This intentionally duplicates (rather than imports) the small bit
 * of resolution logic in `lib/theme/theme.ts` — a plain, blocking
 * script cannot use ES module imports and must not depend on the app
 * bundle at all, since it has to run before any of that has loaded.
 * `ThemeProvider` performs the same resolution (and is unit tested
 * via `lib/theme/theme.ts`) once React mounts, so this script only
 * ever needs to get the *first* paint right.
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

/**
 * Renders nothing itself. Its only job is calling `useServerInsertedHTML`
 * (from `next/navigation`) to splice the theme-init `<script>` directly
 * into the HTML Next.js streams to the browser during the server
 * render — *not* by returning it from this component's own JSX.
 *
 * Why this, specifically, and not a raw `<script dangerouslySetInnerHTML>`
 * or `next/script`: both of those failed here, and this project's own
 * dev server was used to confirm exactly how before landing on this.
 *
 *  1. A raw `<script dangerouslySetInnerHTML>` (the original code) is a
 *     React element of type `"script"`. React 19 explicitly flags any
 *     such element found while processing a component's rendered tree
 *     — client-side script tags created this way were never executed
 *     by browsers anyway (dangerouslySetInnerHTML sets raw innerHTML,
 *     and script tags inserted that way don't run), so this is now a
 *     hard error rather than a silent no-op.
 *
 *  2. `next/script` with `strategy="beforeInteractive"` (the previous
 *     attempt at this fix) is Next's own documented mechanism for
 *     exactly this "must run before hydration" case, and it did
 *     eliminate the warning in a production build (`next build`
 *     inlines it via Next's `self.__next_s` early-script-loader — this
 *     was verified directly in the built HTML output). But `next/script`
 *     is *itself* implemented as a Client Component that still calls
 *     `React.createElement("script", ...)` internally, so it hits the
 *     exact same React 19 check as (1) — several `next/script`/
 *     `next-themes` users report the identical warning for this exact
 *     reason (e.g. vercel/next.js and pacocoursey/next-themes issue
 *     trackers). Worse, testing this project's own `npm run dev`
 *     (Turbopack) with a real headless browser showed the warning
 *     *and* that the script never actually ran at all under
 *     `next dev` — `<html data-theme>` stayed unset after load, so
 *     dev mode wasn't just noisy, theme init was silently broken.
 *
 *  3. `useServerInsertedHTML` sidesteps both problems by construction:
 *     the callback below runs once, during the server render, and Next
 *     inserts whatever it returns directly into the HTML byte stream
 *     being sent to the browser — not into this component's own
 *     reconciled/returned element tree. React's client-side hydration
 *     walks *that* tree (this component always returns `null`), so it
 *     never encounters a `"script"`-typed element to flag here at all.
 *     The actual `<script id="theme-init">` still ends up as a literal,
 *     synchronous, blocking tag in `<head>` of the HTML the browser
 *     parses on first load — same execution guarantee (runs during
 *     initial HTML parse, before hydration) as the original code, not
 *     a redesign of when/how it runs.
 */
export function ThemeInitScript() {
  useServerInsertedHTML(() => (
    <script id="theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
  ));
  return null;
}
