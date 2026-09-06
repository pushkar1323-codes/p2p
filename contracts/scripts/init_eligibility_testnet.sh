#!/usr/bin/env bash
#
# One-time bootstrap: calls initialize(admin) on an already-deployed
# eligibility_registry contract instance, setting ADMIN_IDENTITY's
# address as the contract's admin — the only address later allowed to
# call set_eligibility (i.e. the only address that can allow-list
# borrower wallets).
#
# Run this once, after deploy_eligibility_testnet.sh and before
# allowlist_borrower_testnet.sh. Calling it a second time against the
# same contract instance fails with AlreadyInitialized (by design —
# see eligibility_registry/src/lib.rs) and changes nothing; that
# failure is expected and safe if you re-run this script by mistake.
#
# PREREQUISITES:
#   - The Stellar CLI installed (see deploy_eligibility_testnet.sh's
#     header for how).
#   - contracts/.env with:
#       DEPLOYER_IDENTITY   — a funded Testnet identity (see
#                             deploy_eligibility_testnet.sh)
#       ELIGIBILITY_REGISTRY_CONTRACT_ID — the contract ID printed by
#                             deploy_eligibility_testnet.sh
#       ADMIN_IDENTITY      — optional; the local Stellar CLI identity
#                             that becomes the contract's admin.
#                             Defaults to DEPLOYER_IDENTITY if unset —
#                             i.e. by default the same wallet that
#                             deployed the contract also administers
#                             its allow-list. Set this separately only
#                             if you specifically want a different
#                             admin key than the deployer key.
#
# USAGE:
#   cd contracts && ./scripts/init_eligibility_testnet.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$CONTRACTS_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a && source "$CONTRACTS_DIR/.env" && set +a
fi

STELLAR_NETWORK="${STELLAR_NETWORK:-testnet}"
DEPLOYER_IDENTITY="${DEPLOYER_IDENTITY:-}"
ADMIN_IDENTITY="${ADMIN_IDENTITY:-$DEPLOYER_IDENTITY}"
ELIGIBILITY_REGISTRY_CONTRACT_ID="${ELIGIBILITY_REGISTRY_CONTRACT_ID:-}"

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

if [[ -z "$ADMIN_IDENTITY" ]]; then
  echo "error: neither ADMIN_IDENTITY nor DEPLOYER_IDENTITY is set in contracts/.env." >&2
  missing=1
elif command -v stellar >/dev/null 2>&1 && ! stellar keys address "$ADMIN_IDENTITY" >/dev/null 2>&1; then
  echo "error: no local Stellar CLI identity named '$ADMIN_IDENTITY' was found." >&2
  echo "       Create one: stellar keys generate --global $ADMIN_IDENTITY --network testnet --fund" >&2
  missing=1
fi

if [[ -z "$ELIGIBILITY_REGISTRY_CONTRACT_ID" ]]; then
  echo "error: ELIGIBILITY_REGISTRY_CONTRACT_ID is not set." >&2
  echo "       Deploy eligibility_registry first (./scripts/deploy_eligibility_testnet.sh)" >&2
  echo "       and copy the printed contract ID into contracts/.env." >&2
  missing=1
fi

if [[ "$missing" -ne 0 ]]; then
  echo "" >&2
  echo "Stopping: one or more prerequisites are missing. Nothing was invoked." >&2
  exit 1
fi

ADMIN_ADDRESS="$(stellar keys address "$ADMIN_IDENTITY")"

echo "Contract:        eligibility_registry ($ELIGIBILITY_REGISTRY_CONTRACT_ID)"
echo "Network:         $STELLAR_NETWORK"
echo "Admin identity:  $ADMIN_IDENTITY ($ADMIN_ADDRESS)"
echo ""
echo "Calling initialize(admin=$ADMIN_ADDRESS)..."

stellar contract invoke \
  --id "$ELIGIBILITY_REGISTRY_CONTRACT_ID" \
  --source "$ADMIN_IDENTITY" \
  --network "$STELLAR_NETWORK" \
  -- \
  initialize \
  --admin "$ADMIN_ADDRESS"

echo ""
echo "eligibility_registry initialized. $ADMIN_IDENTITY ($ADMIN_ADDRESS) is now its admin."
echo "Next: run ./scripts/allowlist_borrower_testnet.sh for each borrower wallet"
echo "that should be able to create loan requests."
