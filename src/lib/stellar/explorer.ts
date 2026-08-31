/**
 * Stellar Testnet Explorer link helpers.
 *
 * `testnetExplorerUrl` (transaction hashes) already exists in
 * `transaction.ts` and is left untouched. This file only adds the
 * contract-id variant needed by the new Network & Contract dashboard
 * card (L2-P07-UI) — same explorer host/convention, not a duplicate
 * system.
 */

export function testnetContractExplorerUrl(contractId: string): string {
  return `https://stellar.expert/explorer/testnet/contract/${contractId}`;
}
