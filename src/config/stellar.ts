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
};

export function isTestnet(): boolean {
  return stellarConfig.network === "TESTNET";
}
