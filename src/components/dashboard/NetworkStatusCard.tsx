import { NetworkIcon, ExternalLinkIcon } from "@/components/ui/icons";
import { AddressChip } from "@/components/ui/AddressChip";
import { Badge } from "@/components/ui/Badge";
import { stellarConfig } from "@/config/stellar";
import { testnetContractExplorerUrl } from "@/lib/stellar/explorer";
import styles from "./NetworkStatusCard.module.css";

/**
 * Deliberately labels the contract ID as "Configured", not
 * "Connected" or "Healthy" — this card only reflects the app's known
 * configuration (see `config/stellar.ts`), not a verified live
 * connectivity check, so it must not imply more certainty than that.
 *
 * Custom layout (not the generic `SummaryCard`) because this card's
 * content is inherently multi-line (network name + badge, then the
 * contract address), unlike the other cards' single value line.
 */
export function NetworkStatusCard() {
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <span className={styles.label}>Network & Contract</span>
        <span className={styles.iconChip}>
          <NetworkIcon width={18} height={18} />
        </span>
      </div>

      <div className={styles.networkRow}>
        <span className={styles.networkValue}>Stellar {stellarConfig.network}</span>
        <Badge tone="brand">Configured</Badge>
      </div>

      <div className={styles.contractRow}>
        <AddressChip address={stellarConfig.loanRegistryContractId} />
      </div>

      <a
        className={styles.explorerLink}
        href={testnetContractExplorerUrl(stellarConfig.loanRegistryContractId)}
        target="_blank"
        rel="noopener noreferrer"
      >
        View contract
        <ExternalLinkIcon width={13} height={13} />
      </a>
    </div>
  );
}
