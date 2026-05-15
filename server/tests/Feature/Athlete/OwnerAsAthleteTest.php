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
});

it('DELETE /me/athlete is idempotent — returns 204 when nothing to leave', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    $response = $this->deleteJson('/api/v1/me/athlete');
    $response->assertNoContent();
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
    Athlete::factory()->for($academy)->self($owner)->create();

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

it('exposes is_self on the athlete list resource', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    /** @var Academy $academy */
    $academy = $owner->activeAcademy();
    Athlete::factory()->for($academy)->self($owner)->create();
    Athlete::factory()->for($academy)->create();

    $response = $this->getJson('/api/v1/athletes');

    $response->assertOk();
    $items = $response->json('data');
    expect(\count($items))->toBe(2);
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
    $self = Athlete::factory()->for($academy)->self($owner)->create();
    AthletePayment::factory()->for($self)->create([
        'year' => (int) now()->year,
        'month' => (int) now()->month,
    ]);

    $response = $this->getJson('/api/v1/athletes');

    $row = collect($response->json('data'))->firstWhere('is_self', true);
    expect($row['paid_current_month'])->toBeTrue();
});
