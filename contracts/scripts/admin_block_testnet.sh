#!/usr/bin/env bash
#
# Calls admin_block(admin, borrower) on the deployed
# eligibility_registry — the L3-P07/L3-P14 self-registration
# correction's replacement for the old admin-grant model. Admin can
# no longer directly grant eligibility (there is no
# `set_eligibility(..., true)` equivalent) — normal eligibility comes
# only from a borrower's own `register` call (see
# register_borrower_testnet.sh, or the frontend's Register Wallet
# action). This script's only job is the exceptional case: blocking
# (and, via --unblock, unblocking) a borrower.
#
# Pass --unblock to lift a block instead. Unblocking returns the
# borrower to *unregistered*, not directly back to eligible — they
# must call register again themselves (see
# eligibility_registry/src/lib.rs's module doc comment for why).
#
# PREREQUISITES:
#   - eligibility_registry deployed and initialized (see
#     deploy_eligibility_testnet.sh, init_eligibility_testnet.sh).
#   - contracts/.env with:
#       ADMIN_IDENTITY (or DEPLOYER_IDENTITY as a fallback) — must be
#         the same identity init_eligibility_testnet.sh used as admin.
#       ELIGIBILITY_REGISTRY_CONTRACT_ID
#       TEST_BORROWER_ADDRESS — optional default borrower address, so
#         this can be run with no arguments for your usual test
#         wallet. A borrower address passed as an argument overrides
#         this.
#
# USAGE:
#   cd contracts && ./scripts/admin_block_testnet.sh [BORROWER_ADDRESS] [--unblock]
#
#   ./scripts/admin_block_testnet.sh
#     -> blocks TEST_BORROWER_ADDRESS from contracts/.env
#   ./scripts/admin_block_testnet.sh GABC...XYZ
#     -> blocks the given address instead
#   ./scripts/admin_block_testnet.sh GABC...XYZ --unblock
#     -> unblocks the given address

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
TEST_BORROWER_ADDRESS="${TEST_BORROWER_ADDRESS:-}"

# --- Parse arguments ---------------------------------------------------

ACTION="admin_block"
BORROWER_ADDRESS=""

for arg in "$@"; do
  case "$arg" in
    --unblock)
      ACTION="admin_unblock"
      ;;
    -*)
      echo "error: unknown flag '$arg'." >&2
      exit 1
      ;;
    *)
      if [[ -n "$BORROWER_ADDRESS" ]]; then
        echo "error: only one borrower address may be given." >&2
        exit 1
      fi
      BORROWER_ADDRESS="$arg"
      ;;
  esac
done

if [[ -z "$BORROWER_ADDRESS" ]]; then
  BORROWER_ADDRESS="$TEST_BORROWER_ADDRESS"
fi

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
  missing=1
fi

if [[ -z "$ELIGIBILITY_REGISTRY_CONTRACT_ID" ]]; then
  echo "error: ELIGIBILITY_REGISTRY_CONTRACT_ID is not set." >&2
  missing=1
fi

if [[ -z "$BORROWER_ADDRESS" ]]; then
  echo "error: no borrower address given, and TEST_BORROWER_ADDRESS is not set" >&2
  echo "       in contracts/.env either." >&2
  echo "       Usage: ./scripts/admin_block_testnet.sh [BORROWER_ADDRESS] [--unblock]" >&2
  missing=1
elif [[ ! "$BORROWER_ADDRESS" =~ ^G[A-Z2-7]{55}$ ]]; then
  echo "error: '$BORROWER_ADDRESS' does not look like a Stellar public address" >&2
  echo "       (expected to start with 'G' and be 56 characters)." >&2
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
echo "Borrower:        $BORROWER_ADDRESS"
echo "Action:          $ACTION"
echo ""

stellar contract invoke \
  --id "$ELIGIBILITY_REGISTRY_CONTRACT_ID" \
  --source "$ADMIN_IDENTITY" \
  --network "$STELLAR_NETWORK" \
  -- \
  "$ACTION" \
  --admin "$ADMIN_ADDRESS" \
  --borrower "$BORROWER_ADDRESS"

echo ""
if [[ "$ACTION" == "admin_block" ]]; then
  echo "$BORROWER_ADDRESS is now blocked — ineligible immediately, and their"
  echo "own future register() calls will fail with BorrowerBlocked until"
  echo "this script is run again with --unblock."
else
  echo "$BORROWER_ADDRESS's block has been lifted. They are now unregistered"
  echo "(not automatically eligible again) — they must call register()"
  echo "themselves (frontend Register Wallet action, or"
  echo "./scripts/register_borrower_testnet.sh)."
fi
