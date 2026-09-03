#![cfg(test)]

use super::{Error, LoanRegistry, LoanRegistryClient};
use crate::types::LoanStatus;
use eligibility_registry::{EligibilityRegistry, EligibilityRegistryClient};
use soroban_sdk::{
    symbol_short, testutils::Address as _, testutils::Events as _, vec, Address, Env, IntoVal,
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
