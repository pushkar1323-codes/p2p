#!/usr/bin/env bash
#
# Deploys the loan_registry Soroban contract to Stellar Testnet.
#
# WHAT THIS DOES, IN ORDER:
#   1. Checks prerequisites (Stellar CLI, wasm32 target, a configured
#      deployer identity) and stops with a clear message if any are
#      missing — it does not attempt partial/undocumented workarounds.
#   2. Builds the contract reproducibly for the wasm32-unknown-unknown
#      target, using the committed contracts/Cargo.lock.
#   3. Locates the resulting .wasm artifact.
#   4. Deploys it to Stellar Testnet via the Stellar CLI.
#   5. Prints the resulting contract ID and appends a record of the
#      deployment to contracts/loan_registry/DEPLOYMENTS.md.
#
# PREREQUISITES (see contracts/.env.example for config, and
# CONTRACT_STATUS_L2-P04.md for the full explanation):
#   - Rust with the wasm32-unknown-unknown target installed
#       rustup target add wasm32-unknown-unknown
#   - The Stellar CLI installed (provides the `stellar` command)
#       cargo install --locked stellar-cli
#     or see https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli
#   - A funded Testnet identity already configured in the Stellar
#     CLI's local keystore (this script never handles a raw secret
#     key itself):
#       stellar keys generate --global p2p-testnet-deployer --network testnet --fund
#     (`--fund` uses Testnet's public Friendbot faucet to fund the new
#     account — safe on Testnet, meaningless/unavailable on Mainnet.)
#   - contracts/.env copied from contracts/.env.example, with
#     DEPLOYER_IDENTITY set to the identity name you created above.
#
# USAGE:
#   cd contracts && ./scripts/deploy_testnet.sh
#
# This script is idempotent to run repeatedly: each successful run
# deploys a new contract instance (Soroban has no "redeploy in place"
# concept for a plain deploy) and appends a new dated entry to
# DEPLOYMENTS.md rather than overwriting previous ones.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CRATE_DIR="$CONTRACTS_DIR/loan_registry"
WASM_PATH="$CONTRACTS_DIR/target/wasm32-unknown-unknown/release/loan_registry.wasm"
DEPLOYMENTS_RECORD="$CRATE_DIR/DEPLOYMENTS.md"

# --- 1. Load configuration -------------------------------------------------

if [[ -f "$CONTRACTS_DIR/.env" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$CONTRACTS_DIR/.env" && set +a
fi

STELLAR_NETWORK="${STELLAR_NETWORK:-testnet}"
STELLAR_RPC_URL="${STELLAR_RPC_URL:-https://soroban-testnet.stellar.org}"
STELLAR_NETWORK_PASSPHRASE="${STELLAR_NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}"
DEPLOYER_IDENTITY="${DEPLOYER_IDENTITY:-}"

if [[ "$STELLAR_NETWORK" != "testnet" ]]; then
  echo "error: this script only deploys to Testnet (00_MASTER_RULES.md #7)." >&2
  echo "       STELLAR_NETWORK was set to '$STELLAR_NETWORK'." >&2
  exit 1
fi

# --- 2. Check prerequisites -------------------------------------------------

missing=0

if ! command -v stellar >/dev/null 2>&1; then
  echo "error: the 'stellar' CLI is not installed." >&2
  echo "       Install it: cargo install --locked stellar-cli" >&2
  echo "       (or see https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli)" >&2
  missing=1
fi

if command -v rustup >/dev/null 2>&1; then
  if ! rustup target list --installed 2>/dev/null | grep -qx wasm32-unknown-unknown; then
    echo "error: the wasm32-unknown-unknown target is not installed." >&2
    echo "       Install it: rustup target add wasm32-unknown-unknown" >&2
    missing=1
  fi
else
  # No rustup (e.g. a distro-packaged Rust toolchain) — target-list
  # only enumerates targets the compiler *knows about*, not ones with
  # an installed standard library, so it can't confirm this alone.
  # Do a real, minimal build probe instead.
  probe_dir="$(mktemp -d)"
  trap 'rm -rf "$probe_dir"' RETURN
  cat > "$probe_dir/probe.rs" <<'RS'
#![no_std]
#![no_main]
RS
  if ! rustc --target wasm32-unknown-unknown --crate-type lib \
      "$probe_dir/probe.rs" -o "$probe_dir/probe.wasm" >/dev/null 2>&1; then
    echo "error: this Rust toolchain cannot compile for wasm32-unknown-unknown" >&2
    echo "       (no rustup found to install the target's std library, and a" >&2
    echo "       minimal wasm32 build probe failed)." >&2
    echo "       Install rustup (https://rustup.rs) then:" >&2
    echo "         rustup target add wasm32-unknown-unknown" >&2
    missing=1
  fi
  rm -rf "$probe_dir"
  trap - RETURN
fi

if [[ -z "$DEPLOYER_IDENTITY" ]]; then
  echo "error: DEPLOYER_IDENTITY is not set." >&2
  echo "       Copy contracts/.env.example to contracts/.env and set it to the" >&2
  echo "       name of a funded Testnet identity (see this script's header" >&2
  echo "       comment for how to create one with 'stellar keys generate')." >&2
  missing=1
elif command -v stellar >/dev/null 2>&1 && ! stellar keys address "$DEPLOYER_IDENTITY" >/dev/null 2>&1; then
  echo "error: no local Stellar CLI identity named '$DEPLOYER_IDENTITY' was found." >&2
  echo "       Create one: stellar keys generate --global $DEPLOYER_IDENTITY --network testnet --fund" >&2
  missing=1
fi

if [[ "$missing" -ne 0 ]]; then
  echo "" >&2
  echo "Stopping: one or more deployment prerequisites are missing. Nothing was" >&2
  echo "deployed. This script does not invent or substitute a secret key — see" >&2
  echo "the prerequisites above and re-run once they're satisfied." >&2
  exit 1
fi

echo "Deployer identity: $DEPLOYER_IDENTITY ($(stellar keys address "$DEPLOYER_IDENTITY"))"
echo "Network:            $STELLAR_NETWORK"
echo "RPC URL:             $STELLAR_RPC_URL"
echo ""

# --- 3. Build reproducibly --------------------------------------------------

echo "Building loan_registry for wasm32-unknown-unknown (release)..."
( cd "$CONTRACTS_DIR" && cargo build --locked --release --target wasm32-unknown-unknown -p loan_registry )

if [[ ! -f "$WASM_PATH" ]]; then
  echo "error: expected build artifact not found at:" >&2
  echo "       $WASM_PATH" >&2
  exit 1
fi
echo "Built: $WASM_PATH"
echo ""

# --- 4. Deploy to Testnet ----------------------------------------------------

echo "Deploying to Stellar Testnet..."
CONTRACT_ID="$(
  stellar contract deploy \
    --wasm "$WASM_PATH" \
    --source "$DEPLOYER_IDENTITY" \
    --network "$STELLAR_NETWORK"
)"

if [[ -z "$CONTRACT_ID" ]]; then
  echo "error: deployment did not return a contract ID." >&2
  exit 1
fi

echo ""
echo "Deployed. Contract ID: $CONTRACT_ID"

# --- 5. Record the deployment -----------------------------------------------

DEPLOYED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DEPLOYER_ADDRESS="$(stellar keys address "$DEPLOYER_IDENTITY")"

{
  echo ""
  echo "## $DEPLOYED_AT"
  echo "- Contract: loan_registry"
  echo "- Network: Stellar Testnet"
  echo "- Contract ID: \`$CONTRACT_ID\`"
  echo "- Deployer address: \`$DEPLOYER_ADDRESS\`"
  echo "- WASM artifact: \`target/wasm32-unknown-unknown/release/loan_registry.wasm\`"
  echo "- Deployed via: \`contracts/scripts/deploy_testnet.sh\`"
} >> "$DEPLOYMENTS_RECORD"

echo "Recorded in $DEPLOYMENTS_RECORD"
