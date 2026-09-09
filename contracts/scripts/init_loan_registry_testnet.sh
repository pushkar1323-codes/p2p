#!/usr/bin/env bash
#
# Bootstrap/re-wire for an already-deployed loan_registry instance:
# calls initialize(admin) (tolerating AlreadyInitialized — see below),
# then set_eligibility_contract(admin, ELIGIBILITY_REGISTRY_CONTRACT_ID)
# — wiring loan_registry's create_loan_request to whichever
# eligibility_registry deployment is currently configured.
#
# Two situations this script supports:
#   A. loan_registry was just (re)deployed and has never been
#      initialized — this script initializes it, then wires it.
#   B. loan_registry is ALREADY initialized (e.g. the L3-P07/L3-P14
#      self-registration correction: eligibility_registry got a new
#      instance, but loan_registry's own code didn't change, so it
#      was NOT redeployed — see DEPLOYMENT_SEQUENCE.md) and this
#      script is being re-run purely to re-wire it to the new
#      eligibility_registry instance.
#
# `initialize` failing with AlreadyInitialized is expected and NOT
# fatal in situation B — this script detects that specific case and
# continues on to set_eligibility_contract regardless. Any other
# initialize failure (bad network, wrong identity, etc.) IS fatal —
# those indicate a real problem the prerequisite checks below didn't
# already catch.
#
# PREREQUISITES:
#   - The Stellar CLI installed.
#   - contracts/.env with:
#       DEPLOYER_IDENTITY   — a funded Testnet identity
#       ADMIN_IDENTITY      — optional; defaults to DEPLOYER_IDENTITY.
#                             Must be loan_registry's actual admin if
#                             it's already initialized (situation B).
#       LOAN_REGISTRY_CONTRACT_ID        — the currently deployed
#                             loan_registry contract ID.
#       ELIGIBILITY_REGISTRY_CONTRACT_ID — the eligibility_registry
#                             instance to wire to (from
#                             deploy_eligibility_testnet.sh).
#
# USAGE:
#   cd contracts && ./scripts/init_loan_registry_testnet.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$CONTRACTS_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a && source "$CONTRACTS_DIR/.env" && set +a
fi

STELLAR_NETWORK="${STELLAR_NETWORK:-testnet}"
DEPLOYER_IDENTITY="${DEPLOYER_IDENTITY:-}"
ADMIN_IDENTITY="${ADMIN_IDENTITY:-$DEPLOYER_IDENTITY}"
LOAN_REGISTRY_CONTRACT_ID="${LOAN_REGISTRY_CONTRACT_ID:-}"
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
  missing=1
fi

if [[ -z "$LOAN_REGISTRY_CONTRACT_ID" ]]; then
  echo "error: LOAN_REGISTRY_CONTRACT_ID is not set." >&2
  echo "       Set it to the currently deployed loan_registry contract ID" >&2
  echo "       (redeploying via ./scripts/deploy_testnet.sh is only needed" >&2
  echo "       if loan_registry's own source has changed, not for a" >&2
  echo "       re-wiring-only run — see DEPLOYMENT_SEQUENCE.md)." >&2
  missing=1
fi

if [[ -z "$ELIGIBILITY_REGISTRY_CONTRACT_ID" ]]; then
  echo "error: ELIGIBILITY_REGISTRY_CONTRACT_ID is not set." >&2
  echo "       Deploy and initialize eligibility_registry first (see" >&2
  echo "       deploy_eligibility_testnet.sh / init_eligibility_testnet.sh)." >&2
  missing=1
fi

if [[ "$missing" -ne 0 ]]; then
  echo "" >&2
  echo "Stopping: one or more prerequisites are missing. Nothing was invoked." >&2
  exit 1
fi

ADMIN_ADDRESS="$(stellar keys address "$ADMIN_IDENTITY")"

echo "Contract:            loan_registry ($LOAN_REGISTRY_CONTRACT_ID)"
echo "Network:             $STELLAR_NETWORK"
echo "Admin identity:      $ADMIN_IDENTITY ($ADMIN_ADDRESS)"
echo "Eligibility dep:     eligibility_registry ($ELIGIBILITY_REGISTRY_CONTRACT_ID)"
echo ""

echo "Calling initialize(admin=$ADMIN_ADDRESS)..."
set +e
INIT_OUTPUT="$(
  stellar contract invoke \
    --id "$LOAN_REGISTRY_CONTRACT_ID" \
    --source "$ADMIN_IDENTITY" \
    --network "$STELLAR_NETWORK" \
    -- \
    initialize \
    --admin "$ADMIN_ADDRESS" 2>&1
)"
INIT_EXIT=$?
set -e
echo "$INIT_OUTPUT"

if [[ "$INIT_EXIT" -ne 0 ]]; then
  if echo "$INIT_OUTPUT" | grep -q "Error(Contract, #5)"; then
    echo ""
    echo "loan_registry is already initialized (Error #5, AlreadyInitialized)"
    echo "— expected if you're re-wiring an existing instance. Continuing to"
    echo "set_eligibility_contract..."
  else
    echo "" >&2
    echo "error: initialize failed for a reason other than" >&2
    echo "       AlreadyInitialized — stopping before" >&2
    echo "       set_eligibility_contract. See the output above." >&2
    exit 1
  fi
fi

echo ""
echo "Calling set_eligibility_contract(admin=$ADMIN_ADDRESS, contract_id=$ELIGIBILITY_REGISTRY_CONTRACT_ID)..."
stellar contract invoke \
  --id "$LOAN_REGISTRY_CONTRACT_ID" \
  --source "$ADMIN_IDENTITY" \
  --network "$STELLAR_NETWORK" \
  -- \
  set_eligibility_contract \
  --admin "$ADMIN_ADDRESS" \
  --contract_id "$ELIGIBILITY_REGISTRY_CONTRACT_ID"

echo ""
echo "loan_registry is wired to eligibility_registry ($ELIGIBILITY_REGISTRY_CONTRACT_ID)."
echo "Reminder: borrowers must register themselves against that contract"
echo "(the frontend's Register Wallet action, or"
echo "./scripts/register_borrower_testnet.sh for CLI testing) before"
echo "create_loan_request will succeed for them — nobody is eligible until"
echo "they've done that themselves."
