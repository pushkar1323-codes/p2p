import { Badge } from "@/components/ui/Badge";
import type { LoanStatus } from "@/lib/stellar/loanRegistry";

const TONE_BY_STATUS: Record<LoanStatus, "success" | "neutral" | "brand"> = {
  Open: "success",
  Funded: "brand",
  Cancelled: "neutral",
};

export function LoanStatusBadge({ status }: { status: LoanStatus }) {
  return <Badge tone={TONE_BY_STATUS[status]}>{status}</Badge>;
}
