<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

it('enrolls the caller as a self-row in their active academy on POST /me/athlete', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    $response = $this->postJson('/api/v1/me/athlete');

    $response->assertCreated();
    $response->assertJsonPath('data.is_self', true);
    $response->assertJsonPath('data.belt', Belt::White->value);
    $response->assertJsonPath('data.status', AthleteStatus::Active->value);

    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    expect($academy->athletes()->where('user_id', $owner->id)->where('is_self', true)->count())->toBe(1);
});

it('is idempotent — a second POST returns 200 with the same id', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    $first = $this->postJson('/api/v1/me/athlete');
    $first->assertCreated();
    $firstId = $first->json('data.id');

    $second = $this->postJson('/api/v1/me/athlete');
    $second->assertOk();
    expect($second->json('data.id'))->toBe($firstId);

    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    expect($academy->athletes()->where('user_id', $owner->id)->where('is_self', true)->count())->toBe(1);
});

it('returns 422 on POST when the user has no active academy', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $response = $this->postJson('/api/v1/me/athlete');

    $response->assertStatus(422);
});

it('soft-deletes the self-row on DELETE /me/athlete', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    $this->postJson('/api/v1/me/athlete')->assertCreated();

    $response = $this->deleteJson('/api/v1/me/athlete');
    $response->assertNoContent();

    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    expect($academy->athletes()->where('user_id', $owner->id)->where('is_self', true)->count())->toBe(0);
    expect($academy->athletes()->withTrashed()->where('user_id', $owner->id)->where('is_self', true)->count())->toBe(1);
});

it('preserves history on leave→re-enroll cycle (same athlete row id)', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    $enroll = $this->postJson('/api/v1/me/athlete');
    $firstId = $enroll->json('data.id');

    $this->deleteJson('/api/v1/me/athlete')->assertNoContent();
    $reEnroll = $this->postJson('/api/v1/me/athlete');

    // Restored, not a fresh row — the trashed-row idempotency path
    // returns the same id so promotion / attendance history follows.
    expect($reEnroll->json('data.id'))->toBe($firstId);

    // And the status code is 200 (existing row resurrected), not 201
    // (which would be the wrong REST semantic — the row IS the same
    // resource as before, not a newly created one). Copilot review on
    // #748.
    $reEnroll->assertOk();
});

it('refreshes name and email on restore when the user profile drifted', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    $enroll = $this->postJson('/api/v1/me/athlete');
    $athleteId = (int) $enroll->json('data.id');
    $this->deleteJson('/api/v1/me/athlete')->assertNoContent();

    // Simulate the user changing their profile while their athlete
    // row is in the trash (the common "I left months ago, then renamed
    // my account, then re-enrolled" path).
    $owner->forceFill([
        'first_name' => 'New',
        'last_name' => 'Identity',
        'email' => 'renamed@example.com',
    ])->save();

    $reEnroll = $this->postJson('/api/v1/me/athlete');
    $reEnroll->assertOk();
    $reEnroll->assertJsonPath('data.id', $athleteId);
    $reEnroll->assertJsonPath('data.first_name', 'New');
    $reEnroll->assertJsonPath('data.last_name', 'Identity');
    $reEnroll->assertJsonPath('data.email', 'renamed@example.com');
});

it('DELETE /me/athlete is idempotent — returns 204 when nothing to leave', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    $response = $this->deleteJson('/api/v1/me/athlete');
    $response->assertNoContent();
});

it('DELETE /me/athlete returns 422 when the user has no active academy (mirrors POST)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $response = $this->deleteJson('/api/v1/me/athlete');

    // Symmetric with POST 422 — Copilot review on #748. Without
    // this, POST and DELETE silently disagree on the same
    // precondition: POST says "tell me the user has no active
    // academy", DELETE shrugs and says 204. The standard envelope
    // shape lets the SPA's 422 toast wiring handle it uniformly.
    $response->assertStatus(422);
    $response->assertJsonPath('errors.academy_id.0', 'no_active_academy');
});

it('POST /me/athlete returns the standard 422 envelope shape on no-active-academy', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $response = $this->postJson('/api/v1/me/athlete');

    // Standard `{ message, errors }` envelope — the SPA's
    // error interceptor expects this shape on every 422.
    $response->assertStatus(422);
    $response->assertJsonStructure(['message', 'errors' => ['academy_id']]);
    $response->assertJsonPath('errors.academy_id.0', 'no_active_academy');
});

it('rejects DELETE /api/v1/athletes/{id} on a self-row with 403', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    $enroll = $this->postJson('/api/v1/me/athlete');
    $selfId = $enroll->json('data.id');

    $response = $this->deleteJson("/api/v1/athletes/{$selfId}");

    $response->assertForbidden();
    expect(Athlete::find($selfId))->not->toBeNull();
});

it('excludes self-rows from the unpaid-this-month digest source list', function (): void {
    $owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $owner->activeAcademy();

    // One regular unpaid active athlete.
    Athlete::factory()->for($academy)->create([
        'status' => AthleteStatus::Active->value,
    ]);
    // The owner-as-athlete (self-row).
    Athlete::factory()->for($academy)->selfFor($owner)->create();

    $year = (int) now()->year;
    $month = (int) now()->month;

    $reflection = new ReflectionClass(\App\Console\Commands\SendUnpaidAthletesDigest::class);
    $method = $reflection->getMethod('unpaidActiveAthletesFor');
    $method->setAccessible(true);
    $instance = $reflection->newInstanceWithoutConstructor();
    $rows = $method->invoke($instance, $academy, $year, $month);

    expect($rows)->toHaveCount(1);
    expect($rows->first()->is_self)->toBeFalse();
});

it('returns 409 when the user already has an athlete row in a different academy', function (): void {
    // Two academies, one user. The "first" academy has an athlete row
    // tied to the user (e.g. invited via the M7 flow). The user is
    // then also the owner of a "second" academy and tries to self-
    // enroll there — the UNIQUE on `athletes.user_id` would otherwise
    // 500 the request. We surface a clean 409 instead. Copilot review
    // on #748.
    $first = userWithAcademy();
    /** @var Academy $firstAcademy */
    $firstAcademy = $first->activeAcademy();
    Athlete::factory()->for($firstAcademy)->create(['user_id' => $first->id]);

    // Acting as the same user; pretend they have a second academy as
    // owner (the fixture doesn't model this multi-academy state
    // explicitly, but the controller path doesn't need it: the
    // enroll action's defensive guard short-circuits on the prior
    // `user_id` row regardless of which academy is active).
    Sanctum::actingAs($first->fresh());

    $response = $this->postJson('/api/v1/me/athlete');

    $response->assertStatus(409);
    $response->assertJsonPath('errors.user_id.0', 'user_already_athlete_elsewhere');
});

it('excludes self-rows from the overdue-push pipeline', function (): void {
    // Public-API assertion: the pipeline NEVER calls $owner->notify
    // for a self-row, regardless of whether the row has a payment for
    // the current month or not. Without this test the digest path is
    // covered (via the private-helper reflection above) but the
    // overdue push fanout is not — Copilot review on #748 explicitly
    // flagged the coverage gap.
    $owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    $academy->update(['monthly_fee_cents' => 5000]);

    // Self-row — must NOT receive the overdue push.
    Athlete::factory()->for($academy)->selfFor($owner)->create();

    \Illuminate\Support\Facades\Notification::fake();

    $this->artisan('budojo:send-athlete-payment-overdue-pushes')->assertSuccessful();

    \Illuminate\Support\Facades\Notification::assertNothingSentTo($owner);
});

it('exposes is_self on the athlete list resource', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    Athlete::factory()->for($academy)->selfFor($owner)->create();
    Athlete::factory()->for($academy)->create();

    $response = $this->getJson('/api/v1/athletes');

    $response->assertOk();
    $items = $response->json('data');
    expect(count($items))->toBe(2);
    $selfCount = collect($items)->where('is_self', true)->count();
    expect($selfCount)->toBe(1);
});

it('owner-as-athlete paid_current_month uses the same payment ledger as a regular athlete', function (): void {
    // Smoke-test: a self-row whose payments relation has a current-
    // month entry reports `paid_current_month = true`. The payment
    // pipeline excludes self-rows from REMINDER fanout (digest +
    // overdue push), but the underlying `payments()` relation works
    // unchanged. This pins that we didn't accidentally null out the
    // computed flag.
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);
    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    /** @var Athlete $self */
    $selfRow = Athlete::factory()->for($academy)->selfFor($owner)->create();
    AthletePayment::factory()->for($selfRow)->create([
        'year' => (int) now()->year,
        'month' => (int) now()->month,
    ]);

    $response = $this->getJson('/api/v1/athletes');

    $row = collect($response->json('data'))->firstWhere('is_self', true);
    expect($row['paid_current_month'])->toBeTrue();
});
