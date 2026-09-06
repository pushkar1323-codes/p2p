#!/usr/bin/env bash
#
# One-time bootstrap for an already-(re)deployed loan_registry
# instance: calls initialize(admin), then set_eligibility_contract
# (admin, ELIGIBILITY_REGISTRY_CONTRACT_ID) — wiring loan_registry's
# create_loan_request to the eligibility_registry deployment.
#
# Run this AFTER:
#   1. deploy_eligibility_testnet.sh + init_eligibility_testnet.sh
#      (+ allowlist_borrower_testnet.sh for at least one test wallet,
#      otherwise nobody will be able to create a loan yet)
#   2. loan_registry has been (re)deployed with the current source —
#      the currently deployed Testnet loan_registry instance predates
#      initialize/set_eligibility_contract entirely and does not need
#      (or support) this script; this is for the NEW deployment only.
#
# Calling initialize a second time against the same contract instance
# fails with AlreadyInitialized (by design) and changes nothing — safe
# if you re-run this script by mistake. set_eligibility_contract can
# be called again later to point at a different eligibility contract,
# by design (L3-P07) — this script does not add or remove that
# flexibility, only exercises it once.
#
# PREREQUISITES:
#   - The Stellar CLI installed.
#   - contracts/.env with:
#       DEPLOYER_IDENTITY   — a funded Testnet identity
#       ADMIN_IDENTITY      — optional; defaults to DEPLOYER_IDENTITY.
#                             Becomes loan_registry's admin. Does not
#                             need to be the same admin identity used
#                             for eligibility_registry, but it's
#                             simplest if it is — this script does not
#                             require or enforce either choice.
#       LOAN_REGISTRY_CONTRACT_ID        — the NEW loan_registry
#                             contract ID (from redeploying via
#                             deploy_testnet.sh), NOT the currently
#                             deployed one recorded in
#                             loan_registry/DEPLOYMENTS.md.
#       ELIGIBILITY_REGISTRY_CONTRACT_ID — from
#                             deploy_eligibility_testnet.sh.
#
# USAGE:
#   cd contracts && ./scripts/init_loan_registry_testnet.sh

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
  echo "       Redeploy loan_registry first (./scripts/deploy_testnet.sh) and" >&2
  echo "       copy the NEW printed contract ID into contracts/.env." >&2
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
stellar contract invoke \
  --id "$LOAN_REGISTRY_CONTRACT_ID" \
  --source "$ADMIN_IDENTITY" \
  --network "$STELLAR_NETWORK" \
  -- \
  initialize \
  --admin "$ADMIN_ADDRESS"

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
echo "loan_registry initialized and wired to eligibility_registry."
echo "Reminder: only borrower addresses allow-listed via"
echo "./scripts/allowlist_borrower_testnet.sh will be able to call"
echo "create_loan_request successfully — everyone else gets"
echo "BorrowerNotEligible until an admin allow-lists them."
