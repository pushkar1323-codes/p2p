import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { SseConnectionStatus } from "@/lib/realtime/sseClient";

const LABEL: Record<SseConnectionStatus, string> = {
  connecting: "Live sync: connecting…",
  open: "Live sync: connected",
  reconnecting: "Live sync: reconnecting…",
  closed: "Live sync: offline",
};

const TONE: Record<SseConnectionStatus, BadgeTone> = {
  connecting: "neutral",
  open: "success",
  reconnecting: "warning",
  // "closed" is a terminal state reached after retry attempts are
  // exhausted (see sseClient.ts): live sync has permanently stopped
  // and won't come back without a page refresh. That's materially
  // worse than "reconnecting" (still actively trying) or "connecting"
  // (a benign initial state), so it gets its own, stronger tone
  // rather than sharing either of theirs.
  closed: "danger",
};

/**
 * The realtime (SSE) connection status, as a badge — a single
 * label/tone mapping shared by Browse Loans, My Loans, and Loan
 * Details so each shows connection status identically instead of
 * re-declaring the same maps.
 */
export function RealtimeStatusBadge({ status }: { status: SseConnectionStatus }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}
