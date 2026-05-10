<?php

declare(strict_types=1);

use App\Models\LoginAttempt;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

// ─── Login flow writes login_attempts rows ───────────────────────────────────

it('writes a login_attempts row on a successful login', function (): void {
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);

    $response = $this->withHeaders([
        'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/119.0.0.0',
    ])->postJson('/api/v1/auth/login', [
        'email' => 'mario@example.com',
        'password' => 'Password1!',
    ]);

    $response->assertOk();

    $rows = LoginAttempt::query()->where('email_attempted', 'mario@example.com')->get();
    expect($rows)->toHaveCount(1);
    expect($rows->first()->success)->toBeTrue();
    expect($rows->first()->user_id)->toBe($user->id);
    expect($rows->first()->user_agent)->toContain('Chrome/119.0.0.0');
    expect($rows->first()->ip_address)->not->toBeEmpty();
});

it('writes a login_attempts row on a failed login (wrong password — user exists)', function (): void {
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);

    $response = $this->postJson('/api/v1/auth/login', [
        'email' => 'mario@example.com',
        'password' => 'WrongPassword!',
    ]);

    $response->assertUnauthorized();

    $row = LoginAttempt::query()->where('email_attempted', 'mario@example.com')->first();
    expect($row)->not->toBeNull();
    expect($row->success)->toBeFalse();
    // user_id IS set even on wrong-password — the user needs to see
    // the failed attempt in their own /me/login-history (the whole
    // point of the feature is detecting unfamiliar attempts on YOUR
    // account). The 401 HTTP response shape is identical to the
    // unknown-email branch, so the attribution doesn't leak account
    // existence to the caller.
    expect($row->user_id)->toBe($user->id);
});

it('writes a login_attempts row on a failed login against an unknown email', function (): void {
    $this->postJson('/api/v1/auth/login', [
        'email' => 'never-registered@example.com',
        'password' => 'whatever',
    ])->assertUnauthorized();

    $row = LoginAttempt::query()
        ->where('email_attempted', 'never-registered@example.com')
        ->first();
    expect($row)->not->toBeNull();
    expect($row->success)->toBeFalse();
    expect($row->user_id)->toBeNull();
});

it('lowercases the typed email before persisting (consistent audit trail)', function (): void {
    $this->postJson('/api/v1/auth/login', [
        'email' => 'Mario.ROSSI@example.com',
        'password' => 'whatever',
    ])->assertUnauthorized();

    // Read the raw stored value — string-equality on the column would
    // match either casing under MySQL's default utf8mb4_unicode_ci
    // collation. The audit-trail invariant is that the BYTES we
    // persist are lowercase, so a future case-sensitive consumer
    // (audit export, legal request) sees a single canonical shape.
    $stored = LoginAttempt::query()->value('email_attempted');
    expect($stored)->toBe('mario.rossi@example.com');
});

it('truncates user-agent strings longer than 1024 chars at insert time', function (): void {
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);

    $longUa = str_repeat('A', 2000);

    $this->withHeaders(['User-Agent' => $longUa])
        ->postJson('/api/v1/auth/login', [
            'email' => 'mario@example.com',
            'password' => 'Password1!',
        ])
        ->assertOk();

    $row = LoginAttempt::query()->where('user_id', $user->id)->first();
    expect($row)->not->toBeNull();
    expect(strlen($row->user_agent))->toBe(1024);
});

// ─── GET /api/v1/me/login-history ────────────────────────────────────────────

it('surfaces wrong-password attempts on the user own login-history list', function (): void {
    // End-to-end check on the wrong-password attribution rule: a
    // failed attempt against an existing account is attributed to
    // that user_id and DOES appear in the user's own /me/login-history.
    // This is the load-bearing security UX of the feature.
    $user = userWithAcademy();
    $user->update(['email' => 'mario@example.com', 'password' => Hash::make('Password1!')]);

    $this->postJson('/api/v1/auth/login', [
        'email' => 'mario@example.com',
        'password' => 'WrongPassword!',
    ])->assertUnauthorized();

    $response = $this->actingAs($user)->getJson('/api/v1/me/login-history');
    $response->assertOk()->assertJsonCount(1, 'data');
    expect($response->json('data.0.success'))->toBeFalse();
});

it('lists the authenticated users last 50 login attempts, newest-first', function (): void {
    $user = userWithAcademy();

    // 3 historical rows + ordering check.
    LoginAttempt::factory()->create([
        'user_id' => $user->id,
        'email_attempted' => $user->email,
        'success' => true,
        'created_at' => Carbon::now()->subDays(2),
    ]);
    LoginAttempt::factory()->failed()->create([
        'user_id' => $user->id,
        'email_attempted' => $user->email,
        'created_at' => Carbon::now()->subHours(1),
    ]);
    LoginAttempt::factory()->create([
        'user_id' => $user->id,
        'email_attempted' => $user->email,
        'success' => true,
        'created_at' => Carbon::now()->subMinutes(5),
    ]);

    $response = $this->actingAs($user)->getJson('/api/v1/me/login-history');

    $response->assertOk()
        ->assertJsonCount(3, 'data')
        ->assertJsonStructure([
            'data' => [
                ['id', 'success', 'device', 'ip_address', 'created_at'],
            ],
        ]);

    $rows = $response->json('data');
    // Newest-first: 5min ago (success) > 1h ago (fail) > 2d ago (success).
    expect([$rows[0]['success'], $rows[1]['success'], $rows[2]['success']])
        ->toBe([true, false, true]);
});

it('parses the user-agent string into a friendly device label at read time', function (): void {
    $user = userWithAcademy();
    LoginAttempt::factory()->create([
        'user_id' => $user->id,
        'email_attempted' => $user->email,
        'user_agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/119.0.0.0',
        'success' => true,
    ]);

    $response = $this->actingAs($user)->getJson('/api/v1/me/login-history');
    $response->assertOk()->assertJsonPath('data.0.device', 'Chrome on macOS');
});

it('caps the list at 50 rows even when the user has more', function (): void {
    $user = userWithAcademy();
    LoginAttempt::factory()->count(60)->create([
        'user_id' => $user->id,
        'email_attempted' => $user->email,
    ]);

    $response = $this->actingAs($user)->getJson('/api/v1/me/login-history');
    $response->assertOk()->assertJsonCount(50, 'data');
});

it('does NOT leak other users login attempts in the list', function (): void {
    $alice = userWithAcademy();
    $bob = User::factory()->create();

    LoginAttempt::factory()->create([
        'user_id' => $alice->id,
        'email_attempted' => $alice->email,
    ]);
    LoginAttempt::factory()->count(3)->create([
        'user_id' => $bob->id,
        'email_attempted' => $bob->email,
    ]);

    $response = $this->actingAs($alice)->getJson('/api/v1/me/login-history');
    $response->assertOk()->assertJsonCount(1, 'data');
});

it('requires authentication on /me/login-history', function (): void {
    $this->getJson('/api/v1/me/login-history')->assertUnauthorized();
});

// ─── Cron: budojo:purge-expired-login-attempts ───────────────────────────────

it('purge cron deletes rows older than 90 days and keeps fresher ones', function (): void {
    $user = User::factory()->create();

    LoginAttempt::factory()->create([
        'user_id' => $user->id,
        'email_attempted' => $user->email,
        'created_at' => Carbon::now()->subDays(91),
    ]);
    LoginAttempt::factory()->create([
        'user_id' => $user->id,
        'email_attempted' => $user->email,
        'created_at' => Carbon::now()->subDays(89),
    ]);

    $this->artisan('budojo:purge-expired-login-attempts')->assertExitCode(0);

    expect(LoginAttempt::query()->count())->toBe(1);
    $survivor = LoginAttempt::query()->first();
    expect($survivor->created_at->diffInDays(Carbon::now(), true))->toBeLessThan(90);
});

it('purge cron --dry-run reports the count without deleting', function (): void {
    $user = User::factory()->create();
    LoginAttempt::factory()->count(3)->create([
        'user_id' => $user->id,
        'email_attempted' => $user->email,
        'created_at' => Carbon::now()->subDays(100),
    ]);

    $this->artisan('budojo:purge-expired-login-attempts --dry-run')->assertExitCode(0);

    expect(LoginAttempt::query()->count())->toBe(3);
});

it('purge cron is a no-op when nothing is older than the retention window', function (): void {
    $user = User::factory()->create();
    LoginAttempt::factory()->count(5)->create([
        'user_id' => $user->id,
        'email_attempted' => $user->email,
        'created_at' => Carbon::now()->subDays(7),
    ]);

    $this->artisan('budojo:purge-expired-login-attempts')->assertExitCode(0);
    expect(LoginAttempt::query()->count())->toBe(5);
});
