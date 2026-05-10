<?php

declare(strict_types=1);

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

// ─── GET /api/v1/me/sessions ─────────────────────────────────────────────────

it('lists every active session tied to the authenticated user, newest-first', function (): void {
    $user = userWithAcademy();

    $first = $user->createToken('Chrome on macOS');
    $second = $user->createToken('Safari on iOS');
    $third = $user->createToken('Firefox on Linux');

    // Force a deterministic ordering by writing distinct
    // last_used_at values on every row — without this the freshly-
    // minted tokens share the same millisecond and the COALESCE
    // sort breaks ties non-deterministically.
    PersonalAccessToken::query()->where('id', $first->accessToken->id)->update([
        'last_used_at' => now()->subMinutes(2),
    ]);
    PersonalAccessToken::query()->where('id', $second->accessToken->id)->update([
        'last_used_at' => now()->subDays(5),
    ]);
    PersonalAccessToken::query()->where('id', $third->accessToken->id)->update([
        'last_used_at' => now()->subSeconds(10),
    ]);

    $response = $this->actingAs($user)->getJson('/api/v1/me/sessions');

    $response->assertOk()
        ->assertJsonCount(3, 'data')
        ->assertJsonStructure([
            'data' => [
                ['id', 'name', 'last_used_at', 'created_at', 'is_current'],
            ],
        ]);

    $names = collect($response->json('data'))->pluck('name')->all();
    // Firefox (10s ago) > Chrome (2m ago) > Safari (5d ago).
    expect($names)->toBe(['Firefox on Linux', 'Chrome on macOS', 'Safari on iOS']);
});

it('marks exactly ONE row as is_current (the token authenticating the request)', function (): void {
    $user = userWithAcademy();
    $other = $user->createToken('Chrome on macOS');
    $current = $user->createToken('Safari on iOS');

    // Drive the request with the specific token so Sanctum's
    // `currentAccessToken()` resolves to the matching PAT row.
    $response = $this->withHeader(
        'Authorization',
        "Bearer {$current->plainTextToken}",
    )->getJson('/api/v1/me/sessions');

    $response->assertOk();

    $rows = $response->json('data');
    $currentFlags = array_column($rows, 'is_current');
    expect(array_filter($currentFlags))->toHaveCount(1);
    expect(count($currentFlags) - count(array_filter($currentFlags)))->toBe(1);

    $currentRow = collect($rows)->firstWhere('is_current', true);
    expect($currentRow['name'])->toBe('Safari on iOS');
    expect($currentRow['id'])->toBe($current->accessToken->id);

    // Sanity: `$other` is NOT current.
    $otherRow = collect($rows)->firstWhere('id', $other->accessToken->id);
    expect($otherRow['is_current'])->toBeFalse();
});

it('does NOT leak other users sessions in the list', function (): void {
    $alice = userWithAcademy();
    $bob = User::factory()->create();

    $alice->createToken('Alice Chrome');
    $bob->createToken('Bob Firefox');
    $bob->createToken('Bob Safari');

    $response = $this->actingAs($alice)->getJson('/api/v1/me/sessions');

    $response->assertOk()->assertJsonCount(1, 'data');
    expect($response->json('data.0.name'))->toBe('Alice Chrome');
});

it('requires authentication', function (): void {
    $this->getJson('/api/v1/me/sessions')->assertUnauthorized();
});

// ─── DELETE /api/v1/me/sessions/{id} ─────────────────────────────────────────

it('revokes a single session by id', function (): void {
    $user = userWithAcademy();
    $survivor = $user->createToken('Chrome on macOS');
    $victim = $user->createToken('Safari on iOS');

    $response = $this->actingAs($user)
        ->deleteJson("/api/v1/me/sessions/{$victim->accessToken->id}");

    $response->assertNoContent();
    expect(PersonalAccessToken::query()->find($victim->accessToken->id))->toBeNull();
    expect(PersonalAccessToken::query()->find($survivor->accessToken->id))->not->toBeNull();
});

it('returns 404 when revoking a token that belongs to another user (no enumeration leak)', function (): void {
    $alice = userWithAcademy();
    $bob = User::factory()->create();
    $bobToken = $bob->createToken('Bob Firefox');

    $response = $this->actingAs($alice)
        ->deleteJson("/api/v1/me/sessions/{$bobToken->accessToken->id}");

    $response->assertNotFound();
    // Bob's token must remain intact — the unauthorized request must
    // not delete it.
    expect(PersonalAccessToken::query()->find($bobToken->accessToken->id))->not->toBeNull();
});

it('returns 404 for a never-existed token id (same shape as cross-user attempt)', function (): void {
    $user = userWithAcademy();
    $user->createToken('Chrome on macOS');

    $this->actingAs($user)
        ->deleteJson('/api/v1/me/sessions/999999')
        ->assertNotFound();
});

it('rejects non-numeric ids at the route layer', function (): void {
    $user = userWithAcademy();
    $this->actingAs($user)
        ->deleteJson('/api/v1/me/sessions/not-a-number')
        ->assertNotFound();
});

it('lets the user revoke their CURRENT session (the next request will 401)', function (): void {
    $user = userWithAcademy();
    $current = $user->createToken('Chrome on macOS');

    $response = $this->withHeader(
        'Authorization',
        "Bearer {$current->plainTextToken}",
    )->deleteJson("/api/v1/me/sessions/{$current->accessToken->id}");

    $response->assertNoContent();
    expect(PersonalAccessToken::query()->find($current->accessToken->id))->toBeNull();
});

// ─── DELETE /api/v1/me/sessions (revoke-all-others) ──────────────────────────

it('revokes every session except the current one', function (): void {
    $user = userWithAcademy();
    $survivor = $user->createToken('Chrome on macOS');
    $victim1 = $user->createToken('Safari on iOS');
    $victim2 = $user->createToken('Firefox on Linux');

    $response = $this->withHeader(
        'Authorization',
        "Bearer {$survivor->plainTextToken}",
    )->deleteJson('/api/v1/me/sessions');

    $response->assertOk()->assertJsonPath('data.revoked', 2);
    expect(PersonalAccessToken::query()->find($survivor->accessToken->id))->not->toBeNull();
    expect(PersonalAccessToken::query()->find($victim1->accessToken->id))->toBeNull();
    expect(PersonalAccessToken::query()->find($victim2->accessToken->id))->toBeNull();
});

it('revoke-all-others returns 0 when the user has only the current session', function (): void {
    $user = userWithAcademy();
    $current = $user->createToken('Chrome on macOS');

    $response = $this->withHeader(
        'Authorization',
        "Bearer {$current->plainTextToken}",
    )->deleteJson('/api/v1/me/sessions');

    $response->assertOk()->assertJsonPath('data.revoked', 0);
    expect(PersonalAccessToken::query()->find($current->accessToken->id))->not->toBeNull();
});

it('revoke-all-others is a no-op when there is no real PAT in the request (TransientToken)', function (): void {
    // `actingAs($user)` binds a Laravel\Sanctum\TransientToken (not a
    // PersonalAccessToken) as the request's currentAccessToken. The
    // controller refuses to revoke ANYTHING in that state — a
    // current_id of 0 with `id != 0` would otherwise wipe every
    // PAT the user owns, which is the opposite of "keep current".
    // In production this case can't happen (auth:sanctum requires a
    // real PAT), but the spec pins the defensive shape.
    $user = userWithAcademy();
    $user->createToken('Chrome on macOS');
    $user->createToken('Safari on iOS');

    $response = $this->actingAs($user)->deleteJson('/api/v1/me/sessions');

    $response->assertOk()->assertJsonPath('data.revoked', 0);
    expect($user->tokens()->count())->toBe(2);
});

it('revoke-all-others does NOT touch other users tokens', function (): void {
    $alice = userWithAcademy();
    $bob = User::factory()->create();

    $aliceCurrent = $alice->createToken('Alice Chrome');
    $aliceOther = $alice->createToken('Alice Safari');
    $bobToken = $bob->createToken('Bob Firefox');

    $this->withHeader(
        'Authorization',
        "Bearer {$aliceCurrent->plainTextToken}",
    )->deleteJson('/api/v1/me/sessions')
        ->assertOk()
        ->assertJsonPath('data.revoked', 1);

    expect(PersonalAccessToken::query()->find($aliceCurrent->accessToken->id))->not->toBeNull();
    expect(PersonalAccessToken::query()->find($aliceOther->accessToken->id))->toBeNull();
    expect(PersonalAccessToken::query()->find($bobToken->accessToken->id))->not->toBeNull();
});
