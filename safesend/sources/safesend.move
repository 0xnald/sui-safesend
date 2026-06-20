module safesend::safesend {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::event;
    use std::option::{Self, Option};
    use std::string::String;

    /// Error codes
    const EPaymentClaimed: u64 = 1;
    const ENotSender: u64 = 2;
    const EAlreadyReleaseTime: u64 = 3;
    const ENotExpiredYet: u64 = 4;

    /// Platform Treasury Address (receives 0.1% transaction fee on settlement)
    const TREASURY: address = @0x804450ab336a932a58bc75dc7968b1903b685995a0e14c75babc3e4c7c84ff79;

    /// The SafePayment object representing the escrowed transaction.
    public struct SafePayment<phantom T> has key, store {
        id: UID,
        sender: address,
        recipient: address, // derived zkLogin address or standard wallet address
        recipient_email: String, // email address if sent to email, otherwise empty
        balance: Option<Coin<T>>,
        release_time: u64, // timestamp in ms when the payment becomes non-reversible
        claimed: bool,
    }

    // --- Events ---

    public struct PaymentCreated has copy, drop {
        payment_id: ID,
        sender: address,
        recipient: address,
        recipient_email: String,
        amount: u64,
        release_time: u64,
    }

    public struct PaymentClaimed has copy, drop {
        payment_id: ID,
        recipient: address,
        amount: u64,
    }

    public struct PaymentCancelled has copy, drop {
        payment_id: ID,
        sender: address,
        amount: u64,
    }

    /// Creates a new safe payment.
    public fun create_payment<T>(
        recipient: address,
        recipient_email: String,
        deposit_coin: Coin<T>,
        lock_duration_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        let release_time = current_time + lock_duration_ms;
        let amount = coin::value(&deposit_coin);

        let payment_uid = object::new(ctx);
        let payment_id = object::uid_to_inner(&payment_uid);

        let payment = SafePayment<T> {
            id: payment_uid,
            sender,
            recipient,
            recipient_email,
            balance: option::some(deposit_coin),
            release_time,
            claimed: false,
        };

        // Share the payment object so it can be queried, cancelled, or claimed on-chain
        transfer::share_object(payment);

        // Emit creation event
        event::emit(PaymentCreated {
            payment_id,
            sender,
            recipient,
            recipient_email,
            amount,
            release_time,
        });
    }

    /// Recipient claims the payment (Recipient pulls funds after finalized).
    /// The SUI is transferred directly to the caller (who must sign with their zkLogin address).
    public fun claim_payment<T>(
        payment: &mut SafePayment<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(!payment.claimed, EPaymentClaimed);
        
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time >= payment.release_time, ENotExpiredYet);

        payment.claimed = true;
        
        // Extract the balance and transfer to the caller
        let mut coins = option::extract(&mut payment.balance);
        let amount = coin::value(&coins);
        let recipient_address = tx_context::sender(ctx);

        // Update the recipient field to the actual claimant
        payment.recipient = recipient_address;

        // Deduct 0.1% platform fee (1/1000)
        let fee_amount = amount / 1000;
        if (fee_amount > 0) {
            let fee_coin = coin::split(&mut coins, fee_amount, ctx);
            transfer::public_transfer(fee_coin, TREASURY);
        };

        transfer::public_transfer(coins, recipient_address);

        // Emit claim event
        event::emit(PaymentClaimed {
            payment_id: object::uid_to_inner(&payment.id),
            recipient: recipient_address,
            amount,
        });
    }

    /// Release the payment directly to the pre-configured recipient's address.
    /// This can be called by anyone (e.g. a keeper) after the safety window expires.
    public fun release_payment<T>(
        payment: &mut SafePayment<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(!payment.claimed, EPaymentClaimed);
        
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time >= payment.release_time, ENotExpiredYet);

        payment.claimed = true;

        let mut coins = option::extract(&mut payment.balance);
        let amount = coin::value(&coins);
        let recipient = payment.recipient;

        // Deduct 0.1% platform fee (1/1000)
        let fee_amount = amount / 1000;
        if (fee_amount > 0) {
            let fee_coin = coin::split(&mut coins, fee_amount, ctx);
            transfer::public_transfer(fee_coin, TREASURY);
        };

        transfer::public_transfer(coins, recipient);

        event::emit(PaymentClaimed {
            payment_id: object::uid_to_inner(&payment.id),
            recipient,
            amount,
        });
    }

    /// Sender cancels the payment and retrieves their coins.
    /// This is only allowed if the payment is NOT claimed yet, AND the current time is BEFORE the release time.
    public fun cancel_payment<T>(
        payment: &mut SafePayment<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender_addr = tx_context::sender(ctx);
        assert!(sender_addr == payment.sender, ENotSender);
        assert!(!payment.claimed, EPaymentClaimed);

        let current_time = clock::timestamp_ms(clock);
        assert!(current_time < payment.release_time, EAlreadyReleaseTime);

        payment.claimed = true;

        let coins = option::extract(&mut payment.balance);
        let amount = coin::value(&coins);

        transfer::public_transfer(coins, sender_addr);

        // Emit cancel event
        event::emit(PaymentCancelled {
            payment_id: object::uid_to_inner(&payment.id),
            sender: sender_addr,
            amount,
        });
    }

    // --- Getters ---

    public fun sender<T>(payment: &SafePayment<T>): address {
        payment.sender
    }

    public fun recipient<T>(payment: &SafePayment<T>): address {
        payment.recipient
    }

    public fun recipient_email<T>(payment: &SafePayment<T>): String {
        payment.recipient_email
    }

    public fun release_time<T>(payment: &SafePayment<T>): u64 {
        payment.release_time
    }

    public fun is_claimed<T>(payment: &SafePayment<T>): bool {
        payment.claimed
    }
}
