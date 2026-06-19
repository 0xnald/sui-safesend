#[test_only]
module safesend::safesend_tests {
    use sui::test_scenario::{Self, Scenario};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::transfer;
    use std::string;
    use safesend::safesend::{Self, SafePayment};

    const ALICE: address = @0xA;
    const BOB: address = @0xB;
    const KEEPER: address = @0xC;

    #[test]
    fun test_success_payment_flow() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, 1000);

        // Step 1: Alice creates a payment of 100 SUI to Bob, locked for 5000 ms (until 6000 ms)
        let coin_val = 100;
        let deposit_coin = coin::mint_for_testing<SUI>(coin_val, test_scenario::ctx(&mut scenario));
        
        safesend::create_payment<SUI>(
            BOB,
            string::utf8(b""), // no email, direct address
            deposit_coin,
            5000,
            &clock,
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::next_tx(&mut scenario, ALICE);

        // Step 2: Bob claims the payment using his zkLogin/wallet address after release_time
        clock::set_for_testing(&mut clock, 6001);
        test_scenario::next_tx(&mut scenario, BOB);
        
        let mut payment = test_scenario::take_shared<SafePayment<SUI>>(&scenario);

        safesend::claim_payment<SUI>(
            &mut payment,
            &clock,
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::return_shared(payment);
        clock::destroy_for_testing(clock);
        test_scenario::end(scenario);
    }

    #[test]
    fun test_cancel_payment_flow() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, 1000);

        // Step 1: Alice creates a payment of 100 SUI to Bob, locked for 5000 ms (until 6000 ms)
        let coin_val = 100;
        let deposit_coin = coin::mint_for_testing<SUI>(coin_val, test_scenario::ctx(&mut scenario));
        
        safesend::create_payment<SUI>(
            BOB,
            string::utf8(b""),
            deposit_coin,
            5000,
            &clock,
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::next_tx(&mut scenario, ALICE);

        // Step 2: Alice cancels the payment at clock=2000 (before release_time=6000)
        clock::set_for_testing(&mut clock, 2000);
        
        let mut payment = test_scenario::take_shared<SafePayment<SUI>>(&scenario);
        
        safesend::cancel_payment<SUI>(
            &mut payment,
            &clock,
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::return_shared(payment);
        clock::destroy_for_testing(clock);
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 3)] // EAlreadyReleaseTime = 3
    fun test_cancel_after_release_time_fails() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, 1000);

        let coin_val = 100;
        let deposit_coin = coin::mint_for_testing<SUI>(coin_val, test_scenario::ctx(&mut scenario));
        
        safesend::create_payment<SUI>(
            BOB,
            string::utf8(b""),
            deposit_coin,
            5000,
            &clock,
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::next_tx(&mut scenario, ALICE);

        // Try to cancel at clock=7000 (after release_time=6000)
        clock::set_for_testing(&mut clock, 7000);
        
        let mut payment = test_scenario::take_shared<SafePayment<SUI>>(&scenario);
        
        safesend::cancel_payment<SUI>(
            &mut payment,
            &clock,
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::return_shared(payment);
        clock::destroy_for_testing(clock);
        test_scenario::end(scenario);
    }

    #[test]
    fun test_release_payment_flow() {
        let mut scenario = test_scenario::begin(ALICE);
        let mut clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, 1000);

        // Alice creates a payment of 100 SUI to Bob
        let coin_val = 100;
        let deposit_coin = coin::mint_for_testing<SUI>(coin_val, test_scenario::ctx(&mut scenario));
        
        safesend::create_payment<SUI>(
            BOB,
            string::utf8(b"bob@gmail.com"),
            deposit_coin,
            5000,
            &clock,
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::next_tx(&mut scenario, ALICE);

        // A third-party keeper releases the payment to Bob after release time
        clock::set_for_testing(&mut clock, 6500);
        test_scenario::next_tx(&mut scenario, KEEPER);

        let mut payment = test_scenario::take_shared<SafePayment<SUI>>(&scenario);
        
        safesend::release_payment<SUI>(
            &mut payment,
            &clock,
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::return_shared(payment);
        clock::destroy_for_testing(clock);
        test_scenario::end(scenario);
    }
}
