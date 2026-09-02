/**
 * Backend API configuration (L3-P05).
 *
 * Mirrors `config/stellar.ts`'s approach: a single, centralized place
 * to read backend-related environment configuration, rather than
 * reading `process.env.NEXT_PUBLIC_BACKEND_URL` ad hoc wherever it's
 * needed. Currently only used to build the real-time (`/events/stream`)
 * SSE URL, since that's the only backend endpoint the frontend calls
 * so far.
 *
 * Not a secret: the backend base URL is public information the
 * client's own network requests will reveal anyway.
 */

interface BackendConfig {
  baseUrl: string;
}

export const backendConfig: BackendConfig = {
  baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000",
};

/** The real-time contract-event stream (Server-Sent Events) URL. */
export function eventsStreamUrl(): string {
  return `${backendConfig.baseUrl}/events/stream`;
}
