#![cfg(test)]

use super::{EligibilityRegistry, EligibilityRegistryClient, Error};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, EligibilityRegistryClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, EligibilityRegistry);
    let client = EligibilityRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, client, admin)
}

#[test]
fn a_borrower_that_was_never_registered_is_not_eligible_by_default() {
    let (env, client, _admin) = setup();
    let borrower = Address::generate(&env);

    assert!(!client.is_borrower_eligible(&borrower));
}

#[test]
fn a_new_wallet_can_self_register() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let borrower = Address::generate(&env);

    client.register(&borrower);

    assert!(client.is_borrower_eligible(&borrower));
}

#[test]
fn registration_is_idempotent() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let borrower = Address::generate(&env);

    client.register(&borrower);
    // Calling it again must be a harmless no-op success, not an
    // error — a borrower checking/ensuring their own eligibility
    // should never be punished for registering twice.
    let result = client.try_register(&borrower);

    assert_eq!(result, Ok(Ok(())));
    assert!(client.is_borrower_eligible(&borrower));
}

#[test]
fn register_fails_before_initialize() {
    let (env, client, _admin) = setup();
    let borrower = Address::generate(&env);

    let result = client.try_register(&borrower);

    assert_eq!(result, Err(Ok(Error::NotInitialized)));
    assert!(!client.is_borrower_eligible(&borrower));
}

#[test]
fn the_admin_can_block_a_registered_borrower() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let borrower = Address::generate(&env);
    client.register(&borrower);
    assert!(client.is_borrower_eligible(&borrower));

    client.admin_block(&admin, &borrower);

    assert!(!client.is_borrower_eligible(&borrower));
}

#[test]
fn the_admin_can_block_a_borrower_who_never_registered() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let borrower = Address::generate(&env);

    client.admin_block(&admin, &borrower);

    assert!(!client.is_borrower_eligible(&borrower));
}

#[test]
fn a_blocked_borrower_cannot_self_register() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let borrower = Address::generate(&env);
    client.admin_block(&admin, &borrower);

    let result = client.try_register(&borrower);

    assert_eq!(result, Err(Ok(Error::BorrowerBlocked)));
    assert!(!client.is_borrower_eligible(&borrower));
}

#[test]
fn a_registered_borrower_who_is_then_blocked_cannot_re_register() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let borrower = Address::generate(&env);
    client.register(&borrower);
    client.admin_block(&admin, &borrower);

    let result = client.try_register(&borrower);

    assert_eq!(result, Err(Ok(Error::BorrowerBlocked)));
    assert!(!client.is_borrower_eligible(&borrower));
}

#[test]
fn admin_block_fails_before_initialize() {
    let (env, client, admin) = setup();
    let borrower = Address::generate(&env);

    let result = client.try_admin_block(&admin, &borrower);

    assert_eq!(result, Err(Ok(Error::NotInitialized)));
}

#[test]
fn a_non_admin_cannot_block_a_borrower() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let stranger = Address::generate(&env);
    let borrower = Address::generate(&env);
    client.register(&borrower);

    let result = client.try_admin_block(&stranger, &borrower);

    assert_eq!(result, Err(Ok(Error::NotAdmin)));
    // The rejected attempt must not have changed the borrower's
    // eligibility.
    assert!(client.is_borrower_eligible(&borrower));
}

#[test]
fn the_admin_can_unblock_a_borrower() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let borrower = Address::generate(&env);
    client.admin_block(&admin, &borrower);

    client.admin_unblock(&admin, &borrower);

    // Unblocking returns them to unregistered, not straight back to
    // eligible.
    assert!(!client.is_borrower_eligible(&borrower));
}

#[test]
fn an_unblocked_wallet_is_still_unregistered_until_it_registers_again() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let borrower = Address::generate(&env);
    client.register(&borrower);
    client.admin_block(&admin, &borrower);

    client.admin_unblock(&admin, &borrower);
    assert!(!client.is_borrower_eligible(&borrower));

    // The borrower must explicitly register again — admin_unblock
    // never grants eligibility on their behalf.
    client.register(&borrower);
    assert!(client.is_borrower_eligible(&borrower));
}

#[test]
fn admin_unblock_fails_before_initialize() {
    let (env, client, admin) = setup();
    let borrower = Address::generate(&env);

    let result = client.try_admin_unblock(&admin, &borrower);

    assert_eq!(result, Err(Ok(Error::NotInitialized)));
}

#[test]
fn a_non_admin_cannot_unblock_a_borrower() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let stranger = Address::generate(&env);
    let borrower = Address::generate(&env);
    client.admin_block(&admin, &borrower);

    let result = client.try_admin_unblock(&stranger, &borrower);

    assert_eq!(result, Err(Ok(Error::NotAdmin)));
    // The rejected attempt must not have lifted the block.
    let register_attempt = client.try_register(&borrower);
    assert_eq!(register_attempt, Err(Ok(Error::BorrowerBlocked)));
}

#[test]
fn initialize_cannot_be_called_twice() {
    let (_env, client, admin) = setup();
    client.initialize(&admin);

    let result = client.try_initialize(&admin);

    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}
