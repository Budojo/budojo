<?php

declare(strict_types=1);

use App\Models\PendingDeletion;
use App\Models\User;
use Illuminate\Support\Carbon;

// ─── POST /api/v1/me/deletion-request/cancel/{token} ─────────────────────────
//
// Public, unauthenticated endpoint that consumes the one-time token
// from the deletion-confirmation email. Hits before the user has been
// purged (i.e. inside the 30-day grace window). Successful call deletes
// the `pending_deletions` row and the user's account is preserved.

it('cancels the pending deletion when the token matches an active row', function (): void {
    $user = userWithAcademy();
    $token = str_repeat('a', 64);

    $row = PendingDeletion::query()->create([
        'user_id' => $user->id,
        'requested_at' => Carbon::now()->subDays(2),
        'scheduled_for' => Carbon::now()->addDays(28),
        'confirmation_token' => $token,
    ]);

    $response = $this->postJson("/api/v1/me/deletion-request/cancel/{$token}");

    $response->assertOk()
        ->assertJsonPath('data.cancelled', true);

    expect(PendingDeletion::query()->find($row->id))->toBeNull();
    // The user's account itself is untouched.
    expect(User::query()->find($user->id))->not->toBeNull();
});

it('returns cancelled=false when no row matches the token (idempotent click)', function (): void {
    // Already-clicked link OR a token that never existed: same shape.
    // 200 with cancelled=false instead of 404 so the SPA can render a
    // single "your deletion is no longer pending" page either way —
    // the user doesn't need to know whether the link was already used
    // or never valid.
    $response = $this->postJson('/api/v1/me/deletion-request/cancel/' . str_repeat('z', 64));

    $response->assertOk()
        ->assertJsonPath('data.cancelled', false);
});

it('does not require authentication — works even when the user is signed out', function (): void {
    $user = userWithAcademy();
    $token = str_repeat('b', 64);

    PendingDeletion::query()->create([
        'user_id' => $user->id,
        'requested_at' => Carbon::now()->subDays(2),
        'scheduled_for' => Carbon::now()->addDays(28),
        'confirmation_token' => $token,
    ]);

    // No actingAs — clicking the email link from a fresh tab where the
    // user is not logged in must still cancel.
    $response = $this->postJson("/api/v1/me/deletion-request/cancel/{$token}");

    $response->assertOk()
        ->assertJsonPath('data.cancelled', true);
});

it('rejects malformed tokens that do not match the 64-char shape (404 from route binding)', function (): void {
    // A short / wrong-shape token cannot match any real row — but the
    // request shape itself should fail the constraint at the route
    // level, not waste a DB lookup. The 64-char regex constraint on
    // the route parameter pre-empts the action call.
    $response = $this->postJson('/api/v1/me/deletion-request/cancel/short');

    $response->assertNotFound();
});

it('is one-shot — a second click on the same token returns cancelled=false', function (): void {
    $user = userWithAcademy();
    $token = str_repeat('c', 64);

    PendingDeletion::query()->create([
        'user_id' => $user->id,
        'requested_at' => Carbon::now()->subDays(2),
        'scheduled_for' => Carbon::now()->addDays(28),
        'confirmation_token' => $token,
    ]);

    $first = $this->postJson("/api/v1/me/deletion-request/cancel/{$token}");
    $first->assertOk()->assertJsonPath('data.cancelled', true);

    $second = $this->postJson("/api/v1/me/deletion-request/cancel/{$token}");
    $second->assertOk()->assertJsonPath('data.cancelled', false);
});

it('refuses to cancel a row whose grace window has already elapsed', function (): void {
    // Race window: between `scheduled_for` and the cron actually firing,
    // the row still physically exists. A click in that gap should NOT
    // resurrect the account — the deadline passed, the user had 30 days,
    // the conservative answer is to let the queued purge proceed.
    $user = userWithAcademy();
    $token = str_repeat('d', 64);

    $row = PendingDeletion::query()->create([
        'user_id' => $user->id,
        'requested_at' => Carbon::now()->subDays(31),
        'scheduled_for' => Carbon::now()->subSeconds(5),
        'confirmation_token' => $token,
    ]);

    $response = $this->postJson("/api/v1/me/deletion-request/cancel/{$token}");

    $response->assertOk()->assertJsonPath('data.cancelled', false);
    // The row stays so the cron can pick it up on its next tick.
    expect(PendingDeletion::query()->find($row->id))->not->toBeNull();
});
