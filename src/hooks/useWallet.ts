"use client";

/**
 * useWallet
 *
 * Application-facing wallet hook. UI components should depend on this
 * hook's interface, not on `src/lib/wallet/freighter` directly, so
 * that swapping in the Level 2 StellarWalletsKit abstraction later
 * only requires changing this hook's internals.
 *
 * Disconnect is local application state only — Freighter has no
 * session-revoke API, so "disconnect" here means the app forgets the
 * address, not that Freighter itself is disconnected.
 *
 * Address is kept in memory only (React state). It is not persisted
 * to localStorage/cookies; reconnecting after a page reload requires
 * clicking Connect again. Persistence is out of scope for this task.
 */

import { useCallback, useState } from "react";
import {
  checkNetworkMatch,
  connectFreighter,
} from "@/lib/wallet/freighter";
import type { WalletError, WalletState, WalletStatus } from "@/lib/wallet/types";

const initialState: WalletState = {
  status: "disconnected",
  address: null,
  network: null,
  error: null,
};

export interface UseWalletResult extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): UseWalletResult {
  const [state, setState] = useState<WalletState>(initialState);

  const connect = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      status: "connecting",
      error: null,
    }));

    try {
      const address = await connectFreighter();
      const { matches, network } = await checkNetworkMatch();

      const status: WalletStatus = matches ? "connected" : "wrong_network";
      const error: WalletError | null = matches
        ? null
        : {
            code: "WRONG_NETWORK",
            message: `Freighter is set to "${network ?? "an unknown network"}". Switch Freighter to Stellar Testnet to continue.`,
          };

      setState({
        status,
        address,
        network,
        error,
      });
    } catch (err) {
      const walletError = normalizeError(err);
      setState({
        status: statusForError(walletError.code),
        address: null,
        network: null,
        error: walletError,
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    ...state,
    connect,
    disconnect,
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
