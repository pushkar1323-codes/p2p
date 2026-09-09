#!/usr/bin/env bash
#
# Calls register(borrower) on the deployed eligibility_registry, using
# a local Stellar CLI identity as both the borrower and the
# transaction signer — for CLI-based testing only (e.g. reproducing
# the "new wallet can self-register" flow without a browser/Freighter).
# A real user registers through the frontend's Register Wallet action
# instead (see frontend/src/components/loans/RegisterWalletAction.tsx)
# — that calls the exact same contract entrypoint, just signed by
# their own wallet rather than a CLI keystore identity.
#
# This is intentionally NOT an admin script — register() requires the
# borrower's own authorization (`borrower.require_auth()`), which is
# exactly what `--source "$BORROWER_IDENTITY"` provides here. Admin is
# not involved in this call at all.
#
# PREREQUISITES:
#   - eligibility_registry deployed and initialized (see
#     deploy_eligibility_testnet.sh, init_eligibility_testnet.sh).
#   - contracts/.env with:
#       ELIGIBILITY_REGISTRY_CONTRACT_ID
#   - A funded Testnet identity for the borrower, e.g.:
#       stellar keys generate --global p2p-test-borrower --network testnet --fund
#
# USAGE:
#   cd contracts && ./scripts/register_borrower_testnet.sh [BORROWER_IDENTITY]
#
#   Defaults BORROWER_IDENTITY to "p2p-test-borrower" if not given.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$CONTRACTS_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a && source "$CONTRACTS_DIR/.env" && set +a
fi

STELLAR_NETWORK="${STELLAR_NETWORK:-testnet}"
ELIGIBILITY_REGISTRY_CONTRACT_ID="${ELIGIBILITY_REGISTRY_CONTRACT_ID:-}"
BORROWER_IDENTITY="${1:-p2p-test-borrower}"

if [[ "$STELLAR_NETWORK" != "testnet" ]]; then
  echo "error: this script only operates on Testnet (00_MASTER_RULES.md #7)." >&2
  echo "       STELLAR_NETWORK was set to '$STELLAR_NETWORK'." >&2
  exit 1
fi

missing=0

if ! command -v stellar >/dev/null 2>&1; then
  echo "error: the 'stellar' CLI is not installed." >&2
  missing=1
fi

if command -v stellar >/dev/null 2>&1 && ! stellar keys address "$BORROWER_IDENTITY" >/dev/null 2>&1; then
  echo "error: no local Stellar CLI identity named '$BORROWER_IDENTITY' was found." >&2
  echo "       Create one: stellar keys generate --global $BORROWER_IDENTITY --network testnet --fund" >&2
  missing=1
fi

if [[ -z "$ELIGIBILITY_REGISTRY_CONTRACT_ID" ]]; then
  echo "error: ELIGIBILITY_REGISTRY_CONTRACT_ID is not set." >&2
  missing=1
fi

if [[ "$missing" -ne 0 ]]; then
  echo "" >&2
  echo "Stopping: one or more prerequisites are missing. Nothing was invoked." >&2
  exit 1
fi

BORROWER_ADDRESS="$(stellar keys address "$BORROWER_IDENTITY")"

echo "Contract:          eligibility_registry ($ELIGIBILITY_REGISTRY_CONTRACT_ID)"
echo "Network:           $STELLAR_NETWORK"
echo "Borrower identity: $BORROWER_IDENTITY ($BORROWER_ADDRESS)"
echo ""

stellar contract invoke \
  --id "$ELIGIBILITY_REGISTRY_CONTRACT_ID" \
  --source "$BORROWER_IDENTITY" \
  --network "$STELLAR_NETWORK" \
  -- \
  register \
  --borrower "$BORROWER_ADDRESS"

echo ""
echo "$BORROWER_ADDRESS is now eligible to create loan requests."
