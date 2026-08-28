"use client";

/**
 * useWallet
 *
 * Application-facing wallet hook. UI components depend on this hook's
 * interface, not on `src/lib/wallet/kit` directly.
 *
 * L2-P01: now backed by the StellarWalletsKit abstraction
 * (`lib/wallet/kit.ts`) instead of calling Freighter directly. The
 * public shape (`status`, `address`, `network`, `error`, `connect`,
 * `disconnect`) is unchanged from L1-P02 so existing consumers keep
 * working; `wallets`, `selectedWalletId`, and `selectWallet` are new,
 * additive fields for multi-wallet selection.
 *
 * L2-P01 UI refinement: `connect()` no longer pre-guesses a wallet
 * before opening the kit's modal — it calls `connectSelectedWallet()`
 * with no wallet id pre-selected, so `StellarWalletsKit.authModal()`
 * shows a neutral Freighter/Albedo/xBull picker itself (see
 * `lib/wallet/kit.ts`). Whichever wallet the user actually picks is
 * read back from the kit afterward and stored in `selectedWalletId`.
 * `selectWallet(id)` still pre-selects a specific wallet before
 * connecting and is kept for any future custom wallet-picker UI.
 *
 * Disconnect is local application state only — most wallet modules
 * (including Freighter) have no remote session to revoke, so
 * "disconnect" here means the app forgets the address, not that the
 * wallet itself is disconnected.
 *
 * Address is kept in memory only (React state). It is not persisted
 * to localStorage/cookies; reconnecting after a page reload requires
 * connecting again. Persistence is out of scope for this task.
 */

import { useCallback, useEffect, useState } from "react";
import {
  connectSelectedWallet,
  disconnectSelectedWallet,
  FREIGHTER_ID,
  getActiveNetwork,
  listSupportedWallets,
  selectWallet as kitSelectWallet,
} from "@/lib/wallet/kit";
import type { WalletError, WalletState, WalletStatus } from "@/lib/wallet/types";

const initialState: WalletState = {
  status: "disconnected",
  address: null,
  network: null,
  error: null,
  wallets: [],
  selectedWalletId: null,
};

export interface UseWalletResult extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Selects a wallet by id (from `wallets`) and connects to it. */
  selectWallet: (id: string) => Promise<void>;
}

export function useWallet(): UseWalletResult {
  const [state, setState] = useState<WalletState>(initialState);

  useEffect(() => {
    let cancelled = false;

    async function loadWallets() {
      try {
        const wallets = await listSupportedWallets();
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          wallets,
          selectedWalletId: prev.selectedWalletId ?? FREIGHTER_ID,
        }));
      } catch {
        // Listing wallets failing shouldn't block the app — connect()
        // still works with the Freighter default below.
      }
    }

    loadWallets();
    return () => {
      cancelled = true;
    };
  }, []);

  const connectWith = useCallback(
    async (walletId?: string) => {
      setState((prev) => ({
        ...prev,
        status: "connecting",
        error: null,
      }));

      // Only pre-select when a specific wallet id was requested
      // (selectWallet()). The default connect() flow leaves this
      // unset so the kit's own authModal() shows a neutral choice
      // between Freighter/Albedo/xBull, per the L2-P01 single
      // "Connect Wallet" button UI.
      if (walletId) {
        kitSelectWallet(walletId);
      }

      try {
        const { address, walletId: resolvedId, walletName } =
          await connectSelectedWallet(state.wallets);
        const { matches, network } = await getActiveNetwork();

        const status: WalletStatus = matches ? "connected" : "wrong_network";
        const error: WalletError | null = matches
          ? null
          : {
              code: "WRONG_NETWORK",
              message: `${walletName} is set to "${network ?? "an unknown network"}". Switch it to Stellar Testnet to continue.`,
            };

        setState((prev) => ({
          ...prev,
          status,
          address,
          network,
          error,
          selectedWalletId: resolvedId,
        }));
      } catch (err) {
        const walletError = normalizeError(err);
        setState((prev) => ({
          ...prev,
          status: statusForError(walletError.code),
          address: null,
          network: null,
          error: walletError,
        }));
      }
    },
    [state.wallets]
  );

  const connect = useCallback(async () => {
    await connectWith();
  }, [connectWith]);

  const selectWallet = useCallback(
    async (id: string) => {
      await connectWith(id);
    },
    [connectWith]
  );

  const disconnect = useCallback(() => {
    void disconnectSelectedWallet();
    setState((prev) => ({
      ...initialState,
      wallets: prev.wallets,
      selectedWalletId: prev.selectedWalletId,
    }));
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    selectWallet,
  };
}

function statusForError(code: WalletError["code"]): WalletStatus {
  switch (code) {
    case "NOT_INSTALLED":
      return "not_installed";
    case "REJECTED":
      return "rejected";
    case "WRONG_NETWORK":
      return "wrong_network";
    default:
      return "disconnected";
  }
}

function normalizeError(err: unknown): WalletError {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err
  ) {
    return err as WalletError;
  }
  return {
    code: "UNKNOWN",
    message: err instanceof Error ? err.message : "Failed to connect wallet.",
  };
}
