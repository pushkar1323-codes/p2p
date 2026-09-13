"use client";

import { TransactionFeedback } from "@/components/transaction/TransactionFeedback";
import { contractWriteStatusToFeedbackStatus } from "@/components/transaction/contractWriteFeedback";
import { testnetExplorerUrl } from "@/lib/stellar/transaction";
import { useEligibilityRegistration } from "@/hooks/useEligibilityRegistration";
import styles from "./RegisterWalletAction.module.css";

interface RegisterWalletActionProps {
  /** The connected wallet's address — guaranteed non-null by the
   *  caller (only rendered once a wallet is connected). */
  address: string;
  /** Called once, right after a successful registration transaction
   *  is confirmed, so the caller can re-check eligibility (which will
   *  now read `true`) and show the Create Loan Request form instead. */
  onRegistered: () => void;
}

/**
 * Shown in place of the Create Loan Request form when the connected
 * wallet is not yet eligible to borrow. Registration is a real,
 * separate, wallet-signed transaction against `eligibility_registry`
 * — not a frontend-only state change, and not something
 * `create_loan_request` triggers automatically: self-registration is
 * an explicit, distinct step before loan creation.
 */
export function RegisterWalletAction({ address, onRegistered }: RegisterWalletActionProps) {
  const { status, txHash, error, register, reset } = useEligibilityRegistration(address);
  const pending = status === "pending";

  async function handleRegister() {
    if (pending) return;
    await register();
    // Deliberately not gated on the write having actually succeeded:
    // the parent's own eligibility re-check (triggered by this call)
    // is itself the source of truth for whether registration
    // actually took effect — calling it unconditionally here just
    // means a failed attempt gets an (accurate) re-confirmation that
    // the wallet is still not eligible, rather than silently doing
    // nothing.
    onRegistered();
  }

  return (
    <div className={styles.container}>
      <p className={styles.hint}>
        This wallet isn&apos;t registered yet. Registering is a one-time, self-service
        transaction against the Eligibility Registry — no administrator is involved — and is
        required once before you can create a loan request.
      </p>

      <button
        type="button"
        className={styles.primaryButton}
        onClick={handleRegister}
        disabled={pending}
      >
        {pending ? "Registering…" : "Register Wallet"}
      </button>

      {status !== "idle" && (
        <div className={styles.feedback}>
          <TransactionFeedback
            status={contractWriteStatusToFeedbackStatus(status, error)}
            hash={txHash}
            // See LoanRequestActions.tsx's identical comment on this
            // remapping — TransactionFeedback only ever reads
            // `.message`, never `.code`.
            error={error ? { code: "UNKNOWN", message: error.message } : null}
            explorerUrl={txHash ? testnetExplorerUrl(txHash) : null}
            messages={{
              submitted: "Registering your wallet…",
              confirmed: "Wallet registered — you can now create a loan request.",
            }}
          />

          {status === "failure" && (
            <button type="button" className={styles.secondaryButton} onClick={reset}>
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
