import { Badge } from "@/components/ui/Badge";
import type { LoanStatus } from "@/lib/stellar/loanRegistry";

export function LoanStatusBadge({ status }: { status: LoanStatus }) {
  return <Badge tone={status === "Open" ? "success" : "neutral"}>{status}</Badge>;
}
