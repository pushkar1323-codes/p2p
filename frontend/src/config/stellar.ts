/**
 * Centralized Stellar network configuration.
 *
 * All Stellar/Soroban network values must be read from here rather than
 * hard-coded elsewhere in the app. Values are sourced from environment
 * variables so that network configuration can change between
 * development, testnet/staging, and (eventually) mainnet without code
 * changes.
 *
 * Do not put secrets in these variables. This file only holds public
 * network configuration (RPC/Horizon URLs, network passphrase, network
 * name). Wallet keys, API secrets, and database credentials must never
 * be read through this module or exposed to the frontend.
 */

export type StellarNetwork = "TESTNET" | "PUBLIC" | "FUTURENET" | "STANDALONE";

interface StellarConfig {
  network: StellarNetwork;
  networkPassphrase: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
  loanRegistryContractId: string;
  eligibilityRegistryContractId: string;
  nativeXlmSacContractId: string;
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Check your .env file against .env.example.`
    );
  }
  return value;
}

/**
 * Stellar Testnet is the default/only supported network through
 * Level 5 of the project. Mainnet is introduced at Level 6 and must
 * not be enabled implicitly.
 */
export const stellarConfig: StellarConfig = {
  network: (process.env.NEXT_PUBLIC_STELLAR_NETWORK as StellarNetwork) || "TESTNET",
  networkPassphrase: requireEnv(
    "NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE",
    "Test SDF Network ; September 2015"
  ),
  horizonUrl: requireEnv(
    "NEXT_PUBLIC_HORIZON_URL",
    "https://horizon-testnet.stellar.org"
  ),
  sorobanRpcUrl: requireEnv(
    "NEXT_PUBLIC_SOROBAN_RPC_URL",
    "https://soroban-testnet.stellar.org"
  ),
  // Deployed via contracts/scripts/deploy_testnet.sh, then wired to
  // eligibility_registry via contracts/scripts/init_loan_registry_testnet.sh
  // (L3-P14 — see docs/CURRENT_STATUS.md for the full deployment
  // record: deployer/admin address, all transaction hashes, WASM
  // hash). This is a public contract ID, not a secret. Previous
  // (superseded, pre-eligibility) deployment was
  // CAKENBWT2237ASCTOZMFOMQTYWYRXQRMVX7N2OYGH67P7YMJFOD2L7YA — do not
  // revert to it.
  loanRegistryContractId: requireEnv(
    "NEXT_PUBLIC_LOAN_REGISTRY_CONTRACT_ID",
    "CAI7FGT5ORNLOC25SHOJ7DCZVW66DVEDAZMNGTTHBRZYFYU5ACSHQKCS"
  ),
  // Deployed via contracts/scripts/deploy_eligibility_testnet.sh, then
  // initialized via init_eligibility_testnet.sh, and wired into
  // loan_registry via contracts/scripts/init_loan_registry_testnet.sh's
  // set_eligibility_contract call. This is a public contract ID, not a
  // secret.
  //
  // Deliberately NO hardcoded fallback here (unlike the other IDs
  // above): this contract has already been deployed more than once
  // with genuinely incompatible storage models (the original
  // admin-grant `set_eligibility` design, then the current borrower
  // self-registration design — `register`/`admin_block`/
  // `admin_unblock`; see contracts/eligibility_registry/src/lib.rs's
  // module doc comment). A stale hardcoded default previously pointed
  // at the old admin-grant deployment, which has no `register`
  // entrypoint at all — calling it from RegisterWalletAction would
  // fail with a confusing simulation error rather than a clear
  // "not configured" one. Silently falling back to a wrong-but-valid-
  // looking contract ID here is worse than failing loudly, so this
  // value must always come from the environment: set
  // NEXT_PUBLIC_ELIGIBILITY_REGISTRY_CONTRACT_ID to the currently
  // deployed self-registration instance's contract ID (see
  // contracts/eligibility_registry/DEPLOYMENTS.md for the deployment
  // record) in .env.local.
  eligibilityRegistryContractId: requireEnv("NEXT_PUBLIC_ELIGIBILITY_REGISTRY_CONTRACT_ID"),
  // Testnet's native XLM asset, represented as a Stellar Asset
  // Contract — NOT a contract this project deployed. Every Stellar
  // network already has this contract for its native asset; obtained
  // via `stellar contract id asset --network testnet --asset native`
  // (verified value, provided directly for this task — L3-P12
  // funding correction). This is the one token this app currently
  // supports for lender funding (`fund_loan`'s `token` parameter
  // accepts any SEP-41 token; the contract itself does not pin one —
  // this app does, for a coherent UI, since every Testnet wallet
  // already holds XLM with no separate faucet/minting step needed).
  // Public contract ID, not a secret.
  nativeXlmSacContractId: requireEnv(
    "NEXT_PUBLIC_NATIVE_XLM_SAC_CONTRACT_ID",
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
  ),
};

export function isTestnet(): boolean {
  return stellarConfig.network === "TESTNET";
}
