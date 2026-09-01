/**
 * StellarWalletsKit adapter.
 *
 * This is the ONLY module that imports `@creit.tech/stellar-wallets-kit`
 * directly (mirroring how `wallet/freighter.ts` was previously the only
 * module importing `@stellar/freighter-api` directly). `useWallet.ts`
 * and `stellar/transaction.ts` depend on this module's functions, not
 * on the kit itself, so wallet-specific/third-party-library code is
 * not embedded in UI or state logic.
 *
 * Wallet set: Freighter, Albedo, and xBull. This is a deliberately
 * modest selection (not every wallet the kit supports) — hardware
 * wallets (Ledger, Trezor) and WalletConnect-based wallets pull in a
 * large dependency tree (including a critical-severity transitive
 * vulnerability in `protobufjs` via WalletConnect/Reown) and
 * WalletConnect specifically requires an external project ID to
 * configure, which is outside this task's scope. Because the kit's
 * modules are opt-in via explicit subpath imports (not a single
 * barrel that pulls in every wallet), none of that code is imported
 * here and so does not end up in the application bundle.
 *
 * No secrets are handled here. Every wallet module manages its own
 * keys; this app only ever receives a public address, network
 * metadata, and signed transaction XDR.
 */

import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import type { ISupportedWallet } from "@creit.tech/stellar-wallets-kit";
import { Networks } from "@stellar/stellar-sdk";
import { FreighterModule, FREIGHTER_ID } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { stellarConfig } from "@/config/stellar";
import { classifyKitError, toWalletOptions } from "./kitMapping";
import type { WalletError, WalletOption } from "./types";

export { FREIGHTER_ID };

let initialized = false;

/**
 * Initializes the kit once (idempotent). Must only run in the
 * browser — the kit talks to browser extensions and `window`.
 */
function ensureInitialized(): void {
  if (initialized) return;
  StellarWalletsKit.init({
    modules: [new FreighterModule(), new AlbedoModule(), new xBullModule()],
    network:
      stellarConfig.network === "TESTNET" ? Networks.TESTNET : Networks.PUBLIC,
    // The native authModal() already indicates which wallets are
    // installed, since this app now opens it directly from a single
    // "Connect Wallet" button instead of pre-selecting a wallet via
    // three separate buttons (L2-P01 UI refinement).
    authModal: { showInstallLabel: true },
  });
  initialized = true;
}

/**
 * Lists the wallets this app offers through the kit, each with
 * whether it's currently installed/available.
 */
export async function listSupportedWallets(): Promise<WalletOption[]> {
  ensureInitialized();
  const supported: ISupportedWallet[] = await StellarWalletsKit.refreshSupportedWallets();
  return toWalletOptions(supported);
}

/**
 * Selects which wallet subsequent connect/sign calls should use.
 */
export function selectWallet(id: string): void {
  ensureInitialized();
  StellarWalletsKit.setWallet(id);
}

/**
 * Requests the address from the currently selected wallet — the
 * "connect" action. Opens the kit's native `authModal()`, which lets
 * the user pick Freighter/Albedo/xBull itself (L2-P01 UI refinement:
 * this app no longer pre-guesses a wallet before opening the modal).
 *
 * Because the wallet isn't known until the user picks one *inside*
 * the modal, `resolveActiveWallet()` reads it back afterward from
 * `StellarWalletsKit.selectedModule` (which the kit sets as soon as a
 * choice is made, before requesting the address) so that both the
 * returned id/name and any thrown error are labeled with the wallet
 * the user actually chose, not a guess.
 *
 * Throws a normalized WalletError on failure, mirroring the previous
 * `connectFreighter()` behavior.
 */
export async function connectSelectedWallet(
  wallets: WalletOption[]
): Promise<{ address: string; walletId: string; walletName: string }> {
  ensureInitialized();

  try {
    const { address } = await StellarWalletsKit.authModal();
    const { id, name } = resolveActiveWallet(wallets);
    return { address, walletId: id, walletName: name };
  } catch (err) {
    const { name, wasAvailable } = resolveActiveWallet(wallets);
    throw classifyKitError(err, wasAvailable, name);
  }
}

/**
 * Reads back whichever wallet is currently active in the kit's own
 * memory (set by `authModal()` as soon as the user picks one, or by
 * an explicit `selectWallet()` call) and cross-references it against
 * this app's known wallet list for a friendly name and installed
 * state. Falls back to a neutral label if the module isn't in the
 * known list for some reason (should not normally happen).
 */
function resolveActiveWallet(wallets: WalletOption[]): {
  id: string;
  name: string;
  wasAvailable: boolean;
} {
  const active = StellarWalletsKit.selectedModule;
  const id = active?.productId ?? FREIGHTER_ID;
  const known = wallets.find((wallet) => wallet.id === id);
  return {
    id,
    name: known?.name ?? active?.productName ?? "your wallet",
    wasAvailable: known?.isAvailable ?? true,
  };
}

/**
 * Reads the network the currently selected wallet is configured to
 * use and compares it against this app's expected Testnet
 * passphrase (`src/config/stellar.ts`) — same comparison
 * `wallet/freighter.ts`'s `checkNetworkMatch()` previously performed.
 */
export async function getActiveNetwork(): Promise<{
  matches: boolean;
  network: string | null;
}> {
  ensureInitialized();
  try {
    const result = await StellarWalletsKit.getNetwork();
    return {
      matches: result.networkPassphrase === stellarConfig.networkPassphrase,
      network: result.network || null,
    };
  } catch {
    const error: WalletError = {
      code: "UNKNOWN",
      message: "Unable to read the active network from the wallet.",
    };
    throw error;
  }
}

/**
 * Signs a transaction XDR with the currently selected wallet. Used by
 * `stellar/transaction.ts` in place of a direct Freighter-only call,
 * so a transfer works no matter which wallet is selected.
 */
export async function signWithSelectedWallet(
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string }
): Promise<{ signedTxXdr: string; signerAddress?: string }> {
  ensureInitialized();
  return StellarWalletsKit.signTransaction(xdr, opts);
}

/**
 * Clears the kit's connection state. Like the previous Freighter-only
 * disconnect, this is local/application-level only — most wallet
 * modules (including Freighter) have no remote session to revoke.
 */
export async function disconnectSelectedWallet(): Promise<void> {
  if (!initialized) return;
  try {
    await StellarWalletsKit.disconnect();
  } catch {
    // Best-effort: some modules don't implement disconnect() at all
    // (see ModuleInterface.disconnect being optional). Local app
    // state is cleared by the caller (useWallet) regardless.
  }
}
