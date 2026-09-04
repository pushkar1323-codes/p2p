//! Storage keys and access for this contract's persistent state.
//!
//! `DataKey`'s variants (`LoanCount`, `Loan(u64)`) and their
//! `#[contracttype]` derive are unchanged from the former `state.rs`
//! (L3-P06 just relocated them here) — the actual on-chain storage
//! key encoding is identical, so existing stored data for a live
//! contract instance stays readable. `DataKey` itself is no longer
//! `pub`: nothing outside this module needs to name a storage key
//! directly anymore, now that `lib.rs`'s entrypoints go through the
//! small helper functions below instead — a genuine encapsulation
//! improvement this refactor's "storage" responsibility calls for,
//! not a behavior change (nothing external ever depended on `DataKey`
//! being reachable from outside this crate; it isn't part of the
//! contract's on-chain interface either way, since Soroban storage
//! keys are opaque to callers).
//!
//! `loan_count`/`get_loan`/`set_loan`/`next_loan_id` reproduce exactly
//! what `lib.rs` did inline before this refactor — same instance vs.
//! persistent storage choice per key, same default-to-zero read, same
//! increment-then-persist sequence for `next_loan_id`.

use crate::types::{Collateral, Funding, LoanRequest};
use soroban_sdk::{contracttype, Address, Env};

/// Storage keys for this contract's persistent state.
#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// Instance-storage counter: the number of loan requests ever
    /// created, and the source of the next loan request's id.
    LoanCount,
    /// Persistent-storage entry for one loan request, keyed by id.
    Loan(u64),
    /// Instance-storage: this contract's admin address, set once by
    /// `initialize` (L3-P07). The only address allowed to call
    /// `set_eligibility_contract`.
    Admin,
    /// Instance-storage: the address of the configured eligibility
    /// dependency contract `create_loan_request` calls before
    /// persisting a new loan request (L3-P07).
    EligibilityContract,
    /// Persistent-storage entry for one loan's collateral record,
    /// keyed by loan id (L3-P11). Absent if no collateral has ever
    /// been locked for that loan.
    Collateral(u64),
    /// Persistent-storage entry for one loan's funding record, keyed
    /// by loan id (L3-P12). Absent until `fund_loan` succeeds for
    /// that loan.
    Funding(u64),
}

/// Returns the total number of loan requests ever created (including
/// cancelled ones), or `0` if none have been created yet.
pub fn loan_count(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::LoanCount)
        .unwrap_or(0)
}

/// Reads the stored loan request for `loan_id`, if one exists.
pub fn get_loan(env: &Env, loan_id: u64) -> Option<LoanRequest> {
    env.storage().persistent().get(&DataKey::Loan(loan_id))
}

/// Writes (creating or overwriting) the loan request stored at
/// `loan_id`.
pub fn set_loan(env: &Env, loan_id: u64, loan: &LoanRequest) {
    env.storage()
        .persistent()
        .set(&DataKey::Loan(loan_id), loan);
}

/// Allocates and persists the next sequential loan id (ids start at 1
/// and increment; ids are never reused).
pub fn next_loan_id(env: &Env) -> u64 {
    let next = loan_count(env) + 1;
    env.storage().instance().set(&DataKey::LoanCount, &next);
    next
}

/// Reads this contract's configured admin address, if `initialize`
/// has been called (L3-P07).
pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

/// Persists `admin` as this contract's admin address (L3-P07).
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

/// Reads the configured eligibility dependency contract's address, if
/// `set_eligibility_contract` has been called (L3-P07).
pub fn get_eligibility_contract(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::EligibilityContract)
}

/// Persists `contract_id` as the configured eligibility dependency
/// contract's address (L3-P07).
pub fn set_eligibility_contract(env: &Env, contract_id: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::EligibilityContract, contract_id);
}

/// Reads the stored collateral record for `loan_id`, if any collateral
/// has ever been locked for it (whether currently `Locked` or already
/// `Released`) (L3-P11).
pub fn get_collateral(env: &Env, loan_id: u64) -> Option<Collateral> {
    env.storage()
        .persistent()
        .get(&DataKey::Collateral(loan_id))
}

/// Writes (creating or overwriting) the collateral record stored at
/// `loan_id` (L3-P11).
pub fn set_collateral(env: &Env, loan_id: u64, collateral: &Collateral) {
    env.storage()
        .persistent()
        .set(&DataKey::Collateral(loan_id), collateral);
}

/// Reads the stored funding record for `loan_id`, if the loan has
/// been funded (L3-P12).
pub fn get_funding(env: &Env, loan_id: u64) -> Option<Funding> {
    env.storage().persistent().get(&DataKey::Funding(loan_id))
}

/// Writes (creating) the funding record stored at `loan_id`
/// (L3-P12). `funding::fund` calls this only once per loan — no
/// partial or repeated funding is supported, so nothing in this
/// contract ever overwrites an existing `Funding` record.
pub fn set_funding(env: &Env, loan_id: u64, funding: &Funding) {
    env.storage()
        .persistent()
        .set(&DataKey::Funding(loan_id), funding);
}
