#![cfg(test)]

use super::{Error, LoanRegistry, LoanRegistryClient};
use crate::types::{CollateralStatus, LoanStatus};
use eligibility_registry::{EligibilityRegistry, EligibilityRegistryClient};
use soroban_sdk::{
    symbol_short,
    testutils::Address as _,
    testutils::Events as _,
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, IntoVal,
};

/// Registers a fresh `LoanRegistry`, wired up (L3-P07) with a
/// permissive eligibility dependency: `borrower` is eligible, so
/// every pre-L3-P07 test below that calls `create_loan_request` keeps
/// working unmodified — only this fixture changed. Tests that need to
/// control eligibility/authorization directly (dependency rejection,
/// admin checks, the dedicated integration test) build their own
/// `Env`/contracts instead of using this helper — see below.
fn setup() -> (Env, LoanRegistryClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, LoanRegistry);
    let client = LoanRegistryClient::new(&env, &contract_id);
    let borrower = Address::generate(&env);
    let admin = Address::generate(&env);

    let eligibility_id = env.register_contract(None, EligibilityRegistry);
    let eligibility_client = EligibilityRegistryClient::new(&env, &eligibility_id);
    eligibility_client.initialize(&admin);
    eligibility_client.set_eligibility(&admin, &borrower, &true);

    client.initialize(&admin);
    client.set_eligibility_contract(&admin, &eligibility_id);

    (env, client, borrower)
}

#[test]
fn create_loan_request_stores_an_open_loan_with_the_given_fields() {
    let (_env, client, borrower) = setup();

    let loan_id = client.create_loan_request(&borrower, &1_000i128);
    assert_eq!(loan_id, 1);

    let loan = client.get_loan_request(&loan_id);
    assert_eq!(loan.borrower, borrower);
    assert_eq!(loan.amount, 1_000);
    assert_eq!(loan.status, LoanStatus::Open);
}

#[test]
fn loan_ids_increment_sequentially_and_the_count_tracks_the_total() {
    let (_env, client, borrower) = setup();
    assert_eq!(client.get_loan_count(), 0);

    let first = client.create_loan_request(&borrower, &500i128);
    let second = client.create_loan_request(&borrower, &750i128);

    assert_eq!(first, 1);
    assert_eq!(second, 2);
    assert_eq!(client.get_loan_count(), 2);
}

#[test]
fn create_loan_request_rejects_a_zero_amount() {
    let (_env, client, borrower) = setup();

    let result = client.try_create_loan_request(&borrower, &0i128);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
    // A rejected request must not consume a loan id or affect the count.
    assert_eq!(client.get_loan_count(), 0);
}

#[test]
fn create_loan_request_rejects_a_negative_amount() {
    let (_env, client, borrower) = setup();

    let result = client.try_create_loan_request(&borrower, &-10i128);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn the_borrower_can_cancel_their_own_open_loan() {
    let (_env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &1_000i128);

    client.cancel_loan_request(&borrower, &loan_id);

    let loan = client.get_loan_request(&loan_id);
    assert_eq!(loan.status, LoanStatus::Cancelled);
}

#[test]
fn cancelling_an_already_cancelled_loan_fails() {
    let (_env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &1_000i128);
    client.cancel_loan_request(&borrower, &loan_id);

    let result = client.try_cancel_loan_request(&borrower, &loan_id);
    assert_eq!(result, Err(Ok(Error::LoanNotOpen)));
}

#[test]
fn a_different_address_cannot_cancel_someone_elses_loan() {
    let (env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &1_000i128);
    let stranger = Address::generate(&env);

    let result = client.try_cancel_loan_request(&stranger, &loan_id);
    assert_eq!(result, Err(Ok(Error::NotLoanOwner)));

    // The original loan must be unaffected by the failed attempt.
    let loan = client.get_loan_request(&loan_id);
    assert_eq!(loan.status, LoanStatus::Open);
}

#[test]
fn create_loan_request_emits_a_created_event_with_loan_id_and_amount() {
    let (env, client, borrower) = setup();

    let loan_id = client.create_loan_request(&borrower, &1_000i128);

    let events = env.events().all();
    assert_eq!(events.len(), 1);
    assert_eq!(
        events,
        vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("created"), borrower.clone()).into_val(&env),
                (loan_id, 1_000i128).into_val(&env),
            ),
        ]
    );
}

#[test]
fn cancel_loan_request_emits_a_cancelled_event_with_loan_id() {
    let (env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &1_000i128);

    client.cancel_loan_request(&borrower, &loan_id);

    // Two events total: the `created` event from above, then
    // `cancelled`. Only the second (most recent) is asserted here —
    // wrapped in a `soroban_sdk::vec!` on both sides (rather than
    // comparing the raw tuple with `==`) because `Val` itself isn't
    // directly `PartialEq`; the SDK's `Vec` wrapper compares via the
    // host environment instead, which is the same mechanism the
    // `created`-event test above already relies on.
    let events = env.events().all();
    assert_eq!(events.len(), 2);
    assert_eq!(
        vec![&env, events.get(1).unwrap().clone()],
        vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("cancelled"), borrower.clone()).into_val(&env),
                loan_id.into_val(&env),
            ),
        ]
    );
}

#[test]
fn a_failed_create_loan_request_does_not_emit_a_created_event() {
    let (env, client, borrower) = setup();

    let _ = client.try_create_loan_request(&borrower, &0i128);

    assert_eq!(env.events().all().len(), 0);
}

#[test]
fn a_failed_cancel_loan_request_does_not_emit_a_cancelled_event() {
    let (env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &1_000i128);
    let stranger = Address::generate(&env);

    let _ = client.try_cancel_loan_request(&stranger, &loan_id);

    // Only the earlier `created` event should be present — the
    // rejected cancellation by a non-owner must not emit anything.
    let events = env.events().all();
    assert_eq!(events.len(), 1);
    assert_eq!(
        vec![&env, events.get(0).unwrap().clone()],
        vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("created"), borrower.clone()).into_val(&env),
                (loan_id, 1_000i128).into_val(&env),
            ),
        ]
    );
}

#[test]
fn cancelling_a_nonexistent_loan_fails() {
    let (_env, client, borrower) = setup();

    let result = client.try_cancel_loan_request(&borrower, &999u64);
    assert_eq!(result, Err(Ok(Error::LoanNotFound)));
}

#[test]
fn reading_a_nonexistent_loan_fails() {
    let (_env, client, _borrower) = setup();

    let result = client.try_get_loan_request(&999u64);
    assert_eq!(result, Err(Ok(Error::LoanNotFound)));
}

// --- L3-P07: inter-contract communication -----------------------------

// (A) Successful inter-contract call: `setup()` above already wires a
// permissive eligibility dependency and calls `create_loan_request`
// through it for every pre-existing test in this file. This test
// names that path explicitly and asserts on all of it in one place:
// the dependency call succeeds, the loan is persisted, the count
// increases, and the `created` event is emitted.
#[test]
fn create_loan_request_succeeds_when_the_eligibility_dependency_approves_the_borrower() {
    let (env, client, borrower) = setup();

    let loan_id = client.create_loan_request(&borrower, &1_000i128);

    assert_eq!(loan_id, 1);
    assert_eq!(client.get_loan_count(), 1);
    let loan = client.get_loan_request(&loan_id);
    assert_eq!(loan.borrower, borrower);
    assert_eq!(loan.status, LoanStatus::Open);
    let events = env.events().all();
    assert_eq!(events.len(), 1);
    assert_eq!(
        vec![&env, events.get(0).unwrap().clone()],
        vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("created"), borrower.clone()).into_val(&env),
                (loan_id, 1_000i128).into_val(&env),
            ),
        ]
    );
}

// (B) Authorization: only loan_registry's admin may configure the
// eligibility dependency; the loan_registry authorization
// requirements already covered above (e.g. ownership on cancel)
// remain enforced independently of this.
#[test]
fn only_the_admin_can_configure_the_eligibility_contract() {
    let (env, client, _borrower) = setup();
    let stranger = Address::generate(&env);
    let some_contract_address = Address::generate(&env);

    let result = client.try_set_eligibility_contract(&stranger, &some_contract_address);

    assert_eq!(result, Err(Ok(Error::NotAdmin)));
}

#[test]
fn initialize_cannot_be_called_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, LoanRegistry);
    let client = LoanRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let result = client.try_initialize(&admin);

    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn set_eligibility_contract_fails_before_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, LoanRegistry);
    let client = LoanRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let some_contract_address = Address::generate(&env);

    let result = client.try_set_eligibility_contract(&admin, &some_contract_address);

    assert_eq!(result, Err(Ok(Error::NotInitialized)));
}

// (C) Dependency failure: the eligibility dependency rejects the
// borrower (never marked eligible — deny by default), so loan
// creation must fail with a controlled error, and nothing must be
// persisted.
#[test]
fn create_loan_request_fails_when_the_eligibility_dependency_rejects_the_borrower() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let borrower = Address::generate(&env);

    let eligibility_id = env.register_contract(None, EligibilityRegistry);
    let eligibility_client = EligibilityRegistryClient::new(&env, &eligibility_id);
    eligibility_client.initialize(&admin);
    // Deliberately not marking `borrower` eligible.

    let contract_id = env.register_contract(None, LoanRegistry);
    let client = LoanRegistryClient::new(&env, &contract_id);
    client.initialize(&admin);
    client.set_eligibility_contract(&admin, &eligibility_id);

    let result = client.try_create_loan_request(&borrower, &1_000i128);

    assert_eq!(result, Err(Ok(Error::BorrowerNotEligible)));
    assert_eq!(client.get_loan_count(), 0);
    assert_eq!(env.events().all().len(), 0);
}

#[test]
fn create_loan_request_fails_when_no_eligibility_contract_is_configured() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, LoanRegistry);
    let client = LoanRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let borrower = Address::generate(&env);
    client.initialize(&admin);
    // Note: set_eligibility_contract is never called.

    let result = client.try_create_loan_request(&borrower, &1_000i128);

    assert_eq!(result, Err(Ok(Error::EligibilityContractNotConfigured)));
    assert_eq!(client.get_loan_count(), 0);
    assert_eq!(env.events().all().len(), 0);
}

// (D) Integration: both contracts are instantiated independently
// (deliberately not reusing `setup()`), loan_registry is configured
// with the real deployed eligibility_registry's address, and the
// actual cross-contract invocation is exercised end to end — the
// borrower is approved via a genuine call into the dependency
// contract, not a mock.
#[test]
fn loan_registry_and_eligibility_registry_integrate_end_to_end() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let borrower = Address::generate(&env);

    let eligibility_id = env.register_contract(None, EligibilityRegistry);
    let eligibility_client = EligibilityRegistryClient::new(&env, &eligibility_id);
    eligibility_client.initialize(&admin);
    assert!(!eligibility_client.is_borrower_eligible(&borrower));
    eligibility_client.set_eligibility(&admin, &borrower, &true);
    assert!(eligibility_client.is_borrower_eligible(&borrower));

    let loan_registry_id = env.register_contract(None, LoanRegistry);
    let loan_registry_client = LoanRegistryClient::new(&env, &loan_registry_id);
    loan_registry_client.initialize(&admin);
    loan_registry_client.set_eligibility_contract(&admin, &eligibility_id);

    let loan_id = loan_registry_client.create_loan_request(&borrower, &2_500i128);

    let loan = loan_registry_client.get_loan_request(&loan_id);
    assert_eq!(loan.borrower, borrower);
    assert_eq!(loan.amount, 2_500);
    assert_eq!(loan_registry_client.get_loan_count(), 1);

    // Revoking eligibility after the fact must not retroactively
    // affect the already-created loan, but must block a second one.
    eligibility_client.set_eligibility(&admin, &borrower, &false);
    let second_attempt = loan_registry_client.try_create_loan_request(&borrower, &1_000i128);
    assert_eq!(second_attempt, Err(Ok(Error::BorrowerNotEligible)));
    assert_eq!(loan_registry_client.get_loan_count(), 1);
}

// --- L3-P11: collateral locking -----------------------------------

/// Builds on `setup()` and additionally registers a real Stellar
/// Asset Contract (via the SDK's test-only
/// `register_stellar_asset_contract_v2`) as a collateral token, with
/// `initial_balance` already minted to `borrower`. This is a genuine
/// SEP-41 token contract, not a mock — `lock_collateral`'s real
/// `token::Client::transfer` call runs against it exactly as it would
/// against any real Stellar Asset Contract or custom token on-chain,
/// so balance assertions below reflect an actual token movement.
fn setup_with_token(initial_balance: i128) -> (Env, LoanRegistryClient<'static>, Address, Address) {
    let (env, client, borrower) = setup();

    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin);
    let token = sac.address();
    StellarAssetClient::new(&env, &token).mint(&borrower, &initial_balance);

    (env, client, borrower, token)
}

#[test]
fn locking_collateral_transfers_tokens_into_escrow_and_stores_a_locked_record() {
    let (env, client, borrower, token) = setup_with_token(1_000i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);

    client.lock_collateral(&borrower, &loan_id, &token, &600i128);

    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&borrower), 400);
    assert_eq!(token_client.balance(&client.address), 600);

    let collateral = client.get_collateral(&loan_id);
    assert_eq!(collateral.loan_id, loan_id);
    assert_eq!(collateral.borrower, borrower);
    assert_eq!(collateral.token, token);
    assert_eq!(collateral.amount, 600);
    assert_eq!(collateral.status, CollateralStatus::Locked);
}

#[test]
fn locking_collateral_for_a_nonexistent_loan_fails() {
    let (_env, client, borrower, token) = setup_with_token(1_000i128);

    let result = client.try_lock_collateral(&borrower, &999u64, &token, &500i128);
    assert_eq!(result, Err(Ok(Error::LoanNotFound)));

    let missing = client.try_get_collateral(&999u64);
    assert_eq!(missing, Err(Ok(Error::CollateralNotFound)));
}

#[test]
fn locking_collateral_for_a_non_open_loan_fails() {
    let (_env, client, borrower, token) = setup_with_token(1_000i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);
    client.cancel_loan_request(&borrower, &loan_id);

    let result = client.try_lock_collateral(&borrower, &loan_id, &token, &500i128);
    assert_eq!(result, Err(Ok(Error::LoanNotOpen)));

    // The rejected attempt must not have created a collateral record.
    let missing = client.try_get_collateral(&loan_id);
    assert_eq!(missing, Err(Ok(Error::CollateralNotFound)));
}

#[test]
fn a_stranger_cannot_lock_collateral_on_someone_elses_loan() {
    let (env, client, borrower, token) = setup_with_token(1_000i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);
    let stranger = Address::generate(&env);
    StellarAssetClient::new(&env, &token).mint(&stranger, &1_000i128);

    let result = client.try_lock_collateral(&stranger, &loan_id, &token, &500i128);
    assert_eq!(result, Err(Ok(Error::NotLoanOwner)));

    // Neither address's balance may have moved, and no collateral
    // record may exist, after a rejected attempt.
    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&stranger), 1_000);
    assert_eq!(token_client.balance(&client.address), 0);
    let missing = client.try_get_collateral(&loan_id);
    assert_eq!(missing, Err(Ok(Error::CollateralNotFound)));
}

#[test]
fn locking_zero_amount_collateral_fails() {
    let (_env, client, borrower, token) = setup_with_token(1_000i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);

    let result = client.try_lock_collateral(&borrower, &loan_id, &token, &0i128);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn locking_negative_amount_collateral_fails() {
    let (_env, client, borrower, token) = setup_with_token(1_000i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);

    let result = client.try_lock_collateral(&borrower, &loan_id, &token, &-100i128);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn locking_collateral_twice_for_the_same_loan_fails() {
    let (env, client, borrower, token) = setup_with_token(1_000i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);
    client.lock_collateral(&borrower, &loan_id, &token, &400i128);

    let result = client.try_lock_collateral(&borrower, &loan_id, &token, &200i128);
    assert_eq!(result, Err(Ok(Error::CollateralAlreadyLocked)));

    // The original lock must be completely unaffected by the
    // rejected second attempt — same amount, same balances.
    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&borrower), 600);
    assert_eq!(token_client.balance(&client.address), 400);
    let collateral = client.get_collateral(&loan_id);
    assert_eq!(collateral.amount, 400);
    assert_eq!(collateral.status, CollateralStatus::Locked);
}

#[test]
#[should_panic]
fn locking_collateral_with_insufficient_token_balance_panics() {
    let (_env, client, borrower, token) = setup_with_token(100i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);

    // The token contract itself (not loan_registry) rejects this —
    // panicking, per SEP-41's `transfer`, rather than returning a
    // `Result` — so this is asserted with `#[should_panic]` rather
    // than a `try_*` call. See `collateral.rs`'s "Atomicity" docs for
    // why a panic here can never leave partial state.
    client.lock_collateral(&borrower, &loan_id, &token, &500i128);
}

#[test]
fn locking_collateral_emits_a_locked_event_with_loan_id_token_and_amount() {
    let (env, client, borrower, token) = setup_with_token(1_000i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);

    client.lock_collateral(&borrower, &loan_id, &token, &600i128);

    // The token contract's own `mint` (setup) and `transfer` (the
    // lock itself) also emit events into the same `Env`, so this
    // filters down to just `loan_registry`'s own events by contract
    // address rather than assuming an absolute count/position.
    let last_event = env
        .events()
        .all()
        .iter()
        .filter(|(id, _, _)| *id == client.address)
        .last()
        .unwrap();
    assert_eq!(
        vec![&env, last_event],
        vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("coll_lock"), borrower.clone()).into_val(&env),
                (loan_id, token.clone(), 600i128).into_val(&env),
            ),
        ]
    );
}

#[test]
fn a_failed_lock_collateral_call_does_not_emit_an_event() {
    let (env, client, borrower, token) = setup_with_token(1_000i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);
    client.lock_collateral(&borrower, &loan_id, &token, &400i128);
    let events_before = env.events().all().len();

    let _ = client.try_lock_collateral(&borrower, &loan_id, &token, &100i128);

    // The rejected double-lock attempt must not add any event.
    assert_eq!(env.events().all().len(), events_before);
}

#[test]
fn cancelling_a_loan_with_locked_collateral_releases_it_back_to_the_borrower() {
    let (env, client, borrower, token) = setup_with_token(1_000i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);
    client.lock_collateral(&borrower, &loan_id, &token, &600i128);

    client.cancel_loan_request(&borrower, &loan_id);

    let token_client = TokenClient::new(&env, &token);
    assert_eq!(token_client.balance(&borrower), 1_000);
    assert_eq!(token_client.balance(&client.address), 0);

    let collateral = client.get_collateral(&loan_id);
    assert_eq!(collateral.status, CollateralStatus::Released);
    assert_eq!(collateral.amount, 600);
}

#[test]
fn cancelling_a_loan_with_locked_collateral_emits_a_released_event() {
    let (env, client, borrower, token) = setup_with_token(1_000i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);
    client.lock_collateral(&borrower, &loan_id, &token, &600i128);

    client.cancel_loan_request(&borrower, &loan_id);

    // Same filtering rationale as the lock-event test above: only
    // `loan_registry`'s own events, by contract address, not the
    // token contract's `mint`/`transfer` events also present in the
    // same `Env`.
    let last_event = env
        .events()
        .all()
        .iter()
        .filter(|(id, _, _)| *id == client.address)
        .last()
        .unwrap();
    assert_eq!(
        vec![&env, last_event],
        vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("coll_rel"), borrower.clone()).into_val(&env),
                (loan_id, token.clone(), 600i128).into_val(&env),
            ),
        ]
    );
}

#[test]
fn cancelling_a_loan_with_no_collateral_does_not_emit_a_release_event() {
    let (env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &5_000i128);

    client.cancel_loan_request(&borrower, &loan_id);

    // Only `created` and `cancelled` — no `coll_rel`, since this loan
    // never had collateral locked. `release_if_locked` is a no-op.
    let events = env.events().all();
    assert_eq!(events.len(), 2);
    let missing = client.try_get_collateral(&loan_id);
    assert_eq!(missing, Err(Ok(Error::CollateralNotFound)));
}

#[test]
fn locking_collateral_again_after_a_release_via_cancellation_fails() {
    let (_env, client, borrower, token) = setup_with_token(1_000i128);
    let loan_id = client.create_loan_request(&borrower, &5_000i128);
    client.lock_collateral(&borrower, &loan_id, &token, &600i128);
    client.cancel_loan_request(&borrower, &loan_id);

    // The loan is `Cancelled` now, so this is rejected the same way
    // any lock on a non-`Open` loan is — not a new/special error path
    // — but it is asserted explicitly here as the invalid
    // `Released -> Locked` transition L3-P11's test plan calls for.
    let result = client.try_lock_collateral(&borrower, &loan_id, &token, &100i128);
    assert_eq!(result, Err(Ok(Error::LoanNotOpen)));

    // The already-released collateral record must be unaffected.
    let collateral = client.get_collateral(&loan_id);
    assert_eq!(collateral.status, CollateralStatus::Released);
    assert_eq!(collateral.amount, 600);
}

#[test]
fn reading_collateral_for_a_loan_that_never_had_any_fails() {
    let (_env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &5_000i128);

    let result = client.try_get_collateral(&loan_id);
    assert_eq!(result, Err(Ok(Error::CollateralNotFound)));
}
