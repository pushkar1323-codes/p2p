//! Event publishing, extracted out of `lib.rs`'s entrypoint bodies
//! (L3-P06). Topics and data for both events are unchanged from the
//! original inline `env.events().publish(...)` calls — see `lib.rs`'s
//! crate-level docs for the full event contract table, which this
//! module implements exactly (byte-for-byte identical topic/data
//! shapes, verified by the unchanged `test.rs` event assertions).

use soroban_sdk::{symbol_short, Address, Env};

/// Publishes the `("created", borrower)` topics / `(loan_id, amount)`
/// data event for a newly created loan request (L2-P08).
pub fn publish_created(env: &Env, borrower: Address, loan_id: u64, amount: i128) {
    env.events()
        .publish((symbol_short!("created"), borrower), (loan_id, amount));
}

/// Publishes the `("cancelled", borrower)` topics / `loan_id` data
/// event for a cancelled loan request (L2-P08).
pub fn publish_cancelled(env: &Env, borrower: Address, loan_id: u64) {
    env.events()
        .publish((symbol_short!("cancelled"), borrower), loan_id);
}

/// Publishes the `("coll_lock", borrower)` topics / `(loan_id, token,
/// amount)` data event when collateral is successfully locked
/// (L3-P11). The symbol is abbreviated to `coll_lock` (9 characters)
/// to fit `symbol_short!`'s limit, following this file's existing
/// `created`/`cancelled` short-symbol convention.
pub fn publish_collateral_locked(
    env: &Env,
    borrower: Address,
    loan_id: u64,
    token: Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("coll_lock"), borrower),
        (loan_id, token, amount),
    );
}

/// Publishes the `("coll_rel", borrower)` topics / `(loan_id, token,
/// amount)` data event when locked collateral is released back to the
/// borrower (L3-P11) — currently only ever as part of
/// `cancel_loan_request`; see `collateral.rs`.
pub fn publish_collateral_released(
    env: &Env,
    borrower: Address,
    loan_id: u64,
    token: Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("coll_rel"), borrower),
        (loan_id, token, amount),
    );
}
