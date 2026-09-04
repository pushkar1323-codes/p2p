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
  closed: "neutral",
};

/**
 * The realtime (SSE) connection status, as a badge — same
 * label/tone mapping `LoanRegistrySection` originally defined
 * inline, extracted (FCP-02) so Browse Loans/My Loans/Loan Details
 * can show it identically instead of each re-declaring the maps.
 */
export function RealtimeStatusBadge({ status }: { status: SseConnectionStatus }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}
