"use client";

import { useState } from "react";
import { CopyIcon, CheckCircleIcon } from "./icons";
import styles from "./AddressChip.module.css";

interface AddressChipProps {
  address: string;
  /** Characters kept at each end. Defaults to a readable 4/4 truncation. */
  visibleChars?: number;
}

export function truncateStellarAddress(address: string, visibleChars = 4): string {
  if (address.length <= visibleChars * 2 + 3) return address;
  return `${address.slice(0, visibleChars)}…${address.slice(-visibleChars)}`;
}

/** Copy-to-clipboard address display — real on-chain addresses only. */
export function AddressChip({ address, visibleChars = 4 }: AddressChipProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail (permissions, insecure context); the
      // address is still visible and selectable, so this is silent.
    }
  }

  return (
    <span className={styles.chip} title={address}>
      <span className={styles.value}>{truncateStellarAddress(address, visibleChars)}</span>
      <button
        type="button"
        className={styles.copyButton}
        onClick={handleCopy}
        aria-label={copied ? "Address copied" : "Copy address"}
      >
        {copied ? (
          <CheckCircleIcon width={14} height={14} />
        ) : (
          <CopyIcon width={14} height={14} />
        )}
      </button>
    </span>
  );
}
