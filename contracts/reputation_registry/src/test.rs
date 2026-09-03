#![cfg(test)]

use super::{DataKey, Error, ReputationRecord, ReputationRegistry, ReputationRegistryClient};
use soroban_sdk::{
    symbol_short, testutils::Address as _, testutils::Events as _, vec, Address, Env, IntoVal,
};

fn setup() -> (Env, ReputationRegistryClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ReputationRegistry);
    let client = ReputationRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let borrower = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin, borrower)
}

// 1. Initialization succeeds.
#[test]
fn initialization_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ReputationRegistry);
    let client = ReputationRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    let result = client.try_initialize(&admin);

    assert_eq!(result, Ok(Ok(())));
}

// 2. Re-initialization fails.
#[test]
fn reinitialization_fails() {
    let (_env, client, admin, _borrower) = setup();

    let result = client.try_initialize(&admin);

    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}

// 3. Unauthorized completion recording fails.
#[test]
fn unauthorized_completion_recording_fails() {
    let (env, client, _admin, borrower) = setup();
    let stranger = Address::generate(&env);

    let result = client.try_record_loan_completed(&stranger, &borrower);

    assert_eq!(result, Err(Ok(Error::NotAdmin)));
    // The rejected attempt must not have changed the borrower's record.
    assert_eq!(
        client.get_reputation(&borrower),
        ReputationRecord {
            total_loans: 0,
            completed_loans: 0,
            defaulted_loans: 0,
        }
    );
}

// 4. Unauthorized default recording fails.
#[test]
fn unauthorized_default_recording_fails() {
    let (env, client, _admin, borrower) = setup();
    let stranger = Address::generate(&env);

    let result = client.try_record_loan_defaulted(&stranger, &borrower);

    assert_eq!(result, Err(Ok(Error::NotAdmin)));
    assert_eq!(
        client.get_reputation(&borrower),
        ReputationRecord {
            total_loans: 0,
            completed_loans: 0,
            defaulted_loans: 0,
        }
    );
}

// Recording before initialize fails distinctly from a non-admin caller.
#[test]
fn recording_fails_before_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ReputationRegistry);
    let client = ReputationRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let borrower = Address::generate(&env);

    let result = client.try_record_loan_completed(&admin, &borrower);

    assert_eq!(result, Err(Ok(Error::NotInitialized)));
}

// 5. Authorized completion recording succeeds.
#[test]
fn authorized_completion_recording_succeeds() {
    let (_env, client, admin, borrower) = setup();

    client.record_loan_completed(&admin, &borrower);

    assert_eq!(
        client.get_reputation(&borrower),
        ReputationRecord {
            total_loans: 1,
            completed_loans: 1,
            defaulted_loans: 0,
        }
    );
}

// 6. Authorized default recording succeeds.
#[test]
fn authorized_default_recording_succeeds() {
    let (_env, client, admin, borrower) = setup();

    client.record_loan_defaulted(&admin, &borrower);

    assert_eq!(
        client.get_reputation(&borrower),
        ReputationRecord {
            total_loans: 1,
            completed_loans: 0,
            defaulted_loans: 1,
        }
    );
}

// 7. Multiple completed loans accumulate correctly.
#[test]
fn multiple_completed_loans_accumulate_correctly() {
    let (_env, client, admin, borrower) = setup();

    client.record_loan_completed(&admin, &borrower);
    client.record_loan_completed(&admin, &borrower);
    client.record_loan_completed(&admin, &borrower);

    assert_eq!(
        client.get_reputation(&borrower),
        ReputationRecord {
            total_loans: 3,
            completed_loans: 3,
            defaulted_loans: 0,
        }
    );
}

// 8. Multiple defaults accumulate correctly.
#[test]
fn multiple_defaults_accumulate_correctly() {
    let (_env, client, admin, borrower) = setup();

    client.record_loan_defaulted(&admin, &borrower);
    client.record_loan_defaulted(&admin, &borrower);

    assert_eq!(
        client.get_reputation(&borrower),
        ReputationRecord {
            total_loans: 2,
            completed_loans: 0,
            defaulted_loans: 2,
        }
    );
}

// 9. completed + defaulted counters produce the correct total_loans.
#[test]
fn completed_and_defaulted_counters_produce_correct_total_loans() {
    let (_env, client, admin, borrower) = setup();

    client.record_loan_completed(&admin, &borrower);
    client.record_loan_defaulted(&admin, &borrower);
    client.record_loan_completed(&admin, &borrower);

    let record = client.get_reputation(&borrower);
    assert_eq!(record.completed_loans, 2);
    assert_eq!(record.defaulted_loans, 1);
    assert_eq!(
        record.total_loans,
        record.completed_loans + record.defaulted_loans
    );
}

// 10. Unknown borrower returns an empty/default record.
#[test]
fn unknown_borrower_returns_an_empty_default_record() {
    let (env, client, _admin, _borrower) = setup();
    let never_recorded = Address::generate(&env);

    let record = client.get_reputation(&never_recorded);

    assert_eq!(
        record,
        ReputationRecord {
            total_loans: 0,
            completed_loans: 0,
            defaulted_loans: 0,
        }
    );
}

// 11. Reading reputation does not mutate state.
#[test]
fn reading_reputation_does_not_mutate_state() {
    let (_env, client, admin, borrower) = setup();
    client.record_loan_completed(&admin, &borrower);

    // Reading repeatedly must not change the stored record.
    let first_read = client.get_reputation(&borrower);
    let second_read = client.get_reputation(&borrower);

    assert_eq!(first_read, second_read);
    assert_eq!(
        second_read,
        ReputationRecord {
            total_loans: 1,
            completed_loans: 1,
            defaulted_loans: 0,
        }
    );
}

// 12. Counter overflow is safely rejected rather than wrapping.
#[test]
fn recording_a_completed_loan_rejects_counter_overflow() {
    let (env, client, admin, borrower) = setup();

    // Force the borrower's counters right to the u64 boundary so the
    // very next completion would overflow, without needing to
    // actually call record_loan_completed u64::MAX times.
    env.as_contract(&client.address, || {
        env.storage().persistent().set(
            &DataKey::Reputation(borrower.clone()),
            &ReputationRecord {
                total_loans: u64::MAX,
                completed_loans: u64::MAX,
                defaulted_loans: 0,
            },
        );
    });

    let result = client.try_record_loan_completed(&admin, &borrower);

    assert_eq!(result, Err(Ok(Error::CounterOverflow)));
}

#[test]
fn recording_a_defaulted_loan_rejects_counter_overflow() {
    let (env, client, admin, borrower) = setup();

    env.as_contract(&client.address, || {
        env.storage().persistent().set(
            &DataKey::Reputation(borrower.clone()),
            &ReputationRecord {
                total_loans: u64::MAX,
                completed_loans: 0,
                defaulted_loans: u64::MAX,
            },
        );
    });

    let result = client.try_record_loan_defaulted(&admin, &borrower);

    assert_eq!(result, Err(Ok(Error::CounterOverflow)));
}

// 13. Event emission is correct.
#[test]
fn completing_a_loan_emits_a_completed_event_with_updated_counters() {
    let (env, client, admin, borrower) = setup();

    client.record_loan_completed(&admin, &borrower);

    let events = env.events().all();
    assert_eq!(events.len(), 1);
    assert_eq!(
        events,
        vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("completed"), borrower.clone()).into_val(&env),
                (1u64, 1u64).into_val(&env),
            ),
        ]
    );
}

#[test]
fn defaulting_a_loan_emits_a_defaulted_event_with_updated_counters() {
    let (env, client, admin, borrower) = setup();

    client.record_loan_defaulted(&admin, &borrower);

    let events = env.events().all();
    assert_eq!(events.len(), 1);
    assert_eq!(
        events,
        vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("defaulted"), borrower.clone()).into_val(&env),
                (1u64, 1u64).into_val(&env),
            ),
        ]
    );
}

#[test]
fn a_failed_recording_attempt_does_not_emit_an_event() {
    let (env, client, _admin, borrower) = setup();
    let stranger = Address::generate(&env);

    let _ = client.try_record_loan_completed(&stranger, &borrower);
    let _ = client.try_record_loan_defaulted(&stranger, &borrower);

    assert_eq!(env.events().all().len(), 0);
}
