<?php

declare(strict_types=1);

use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('persists encrypted ciphertext in the endpoint + auth columns (#1008)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    $row = PushSubscription::create([
        'user_id' => $user->id,
        'endpoint' => 'https://fcm.googleapis.com/wp/AAAA-secret-token-BBBB',
        'endpoint_hash' => hash('sha256', 'https://fcm.googleapis.com/wp/AAAA-secret-token-BBBB'),
        'p256dh' => 'BasePublicKey',
        'auth' => 'BaseAuthSecret',
    ]);

    // Round-trip through the cast — accessor returns plaintext.
    expect($row->endpoint)->toBe('https://fcm.googleapis.com/wp/AAAA-secret-token-BBBB');
    expect($row->auth)->toBe('BaseAuthSecret');

    // Direct DB read bypasses the cast — must NOT contain the
    // plaintext bearer URL or auth secret.
    $raw = DB::table('push_subscriptions')->where('id', $row->id)->first();
    expect($raw->endpoint)->not->toContain('fcm.googleapis.com');
    expect($raw->endpoint)->not->toContain('AAAA-secret-token-BBBB');
    expect($raw->auth)->not->toBe('BaseAuthSecret');
});

it('p256dh stays plaintext (public key, not a secret)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    $row = PushSubscription::create([
        'user_id' => $user->id,
        'endpoint' => 'https://fcm.googleapis.com/wp/anything',
        'endpoint_hash' => hash('sha256', 'https://fcm.googleapis.com/wp/anything'),
        'p256dh' => 'BNeverEncrypted',
        'auth' => 'whatever',
    ]);

    $raw = DB::table('push_subscriptions')->where('id', $row->id)->first();
    expect($raw->p256dh)->toBe('BNeverEncrypted');
});

it('endpoint_hash stays plaintext SHA-256 (lookup-key invariant)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    $endpoint = 'https://fcm.googleapis.com/wp/lookup-test';
    $expectedHash = hash('sha256', $endpoint);

    PushSubscription::create([
        'user_id' => $user->id,
        'endpoint' => $endpoint,
        'endpoint_hash' => $expectedHash,
        'p256dh' => 'pk',
        'auth' => 'a',
    ]);

    // Lookup-by-hash MUST keep working — every read on push subs
    // resolves through `endpoint_hash`, never the encrypted column.
    $found = PushSubscription::where('endpoint_hash', $expectedHash)->first();
    expect($found)->not->toBeNull();
    expect($found->endpoint)->toBe($endpoint);
});
