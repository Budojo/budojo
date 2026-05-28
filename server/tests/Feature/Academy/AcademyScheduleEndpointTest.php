<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\AcademySchedule;
use App\Models\User;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

/*
 * POST /api/v1/academy/schedules + DELETE /api/v1/academy/schedules/{id}
 * (#1094 PR 2). The endpoints owners use to plan a future schedule
 * change without overwriting today's row. Read-side coverage of the
 * schedule history lives in AcademyScheduleTest (read helpers +
 * resource shape).
 */

afterEach(function (): void {
    Carbon::setTestNow();
});

// ─── POST /academy/schedules ─────────────────────────────────────────────────

it('schedules a future training_days change effective from a future date', function (): void {
    Carbon::setTestNow('2026-05-28');
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/academy/schedules', [
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-06-01',
    ])
        ->assertCreated()
        ->assertJsonPath('data.training_days', [1, 3, 5])
        ->assertJsonPath('data.effective_from', '2026-06-01');

    /** @var Academy $academy */
    $academy = $user->activeAcademy();
    expect($academy->nextSchedule()?->effective_from->toDateString())->toBe('2026-06-01');
    expect($academy->nextSchedule()?->training_days)->toBe([1, 3, 5]);
});

it('schedules a future null-training_days change (immediate "schedule paused" state)', function (): void {
    Carbon::setTestNow('2026-05-28');
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/academy/schedules', [
        'training_days' => null,
        'effective_from' => '2026-06-01',
    ])
        ->assertCreated()
        ->assertJsonPath('data.training_days', null)
        ->assertJsonPath('data.effective_from', '2026-06-01');
});

it('rejects POST with effective_from = today (same-day goes through PATCH /academy)', function (): void {
    Carbon::setTestNow('2026-05-28');
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/academy/schedules', [
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-05-28',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['effective_from']);
});

it('rejects POST with effective_from in the past', function (): void {
    Carbon::setTestNow('2026-05-28');
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/academy/schedules', [
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-05-01',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['effective_from']);
});

it('rejects POST with malformed effective_from', function (): void {
    Carbon::setTestNow('2026-05-28');
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/academy/schedules', [
        'training_days' => [1, 3, 5],
        'effective_from' => '01/06/2026',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['effective_from']);
});

it('rejects training_days outside 0..6 / duplicates / non-int (mirrors POST /academy validation)', function (): void {
    Carbon::setTestNow('2026-05-28');
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/academy/schedules', [
        'training_days' => [1, 7],
        'effective_from' => '2026-06-01',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['training_days.1']);

    $this->postJson('/api/v1/academy/schedules', [
        'training_days' => [1, 1, 3],
        'effective_from' => '2026-06-01',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['training_days.0', 'training_days.1']);
});

it('rejects a second pending future schedule (single-pending invariant)', function (): void {
    Carbon::setTestNow('2026-05-28');
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    $academy->schedules()->create([
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-06-01',
    ]);
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/academy/schedules', [
        'training_days' => [2, 4],
        'effective_from' => '2026-07-01',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['effective_from']);
});

it('returns 401 without auth', function (): void {
    $this->postJson('/api/v1/academy/schedules', [
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-06-01',
    ])->assertUnauthorized();
});

it('returns 403 when user has no academy', function (): void {
    Sanctum::actingAs(User::factory()->create());

    $this->postJson('/api/v1/academy/schedules', [
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-06-01',
    ])->assertForbidden();
});

// ─── DELETE /academy/schedules/{id} ──────────────────────────────────────────

it('cancels a pending future schedule', function (): void {
    Carbon::setTestNow('2026-05-28');
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    $schedule = $academy->schedules()->create([
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-06-01',
    ]);
    Sanctum::actingAs($user);

    $this->deleteJson("/api/v1/academy/schedules/{$schedule->id}")
        ->assertNoContent();

    expect(AcademySchedule::find($schedule->id))->toBeNull();
});

it('refuses to delete a schedule effective today (past/today are immutable)', function (): void {
    Carbon::setTestNow('2026-05-28');
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    $schedule = $academy->schedules()->create([
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-05-28',
    ]);
    Sanctum::actingAs($user);

    $this->deleteJson("/api/v1/academy/schedules/{$schedule->id}")
        ->assertUnprocessable();

    expect(AcademySchedule::find($schedule->id))->not->toBeNull();
});

it('refuses to delete a schedule effective in the past', function (): void {
    Carbon::setTestNow('2026-05-28');
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    $schedule = $academy->schedules()->create([
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-01-01',
    ]);
    Sanctum::actingAs($user);

    $this->deleteJson("/api/v1/academy/schedules/{$schedule->id}")
        ->assertUnprocessable();

    expect(AcademySchedule::find($schedule->id))->not->toBeNull();
});

it('returns 404 when the schedule belongs to another academy', function (): void {
    Carbon::setTestNow('2026-05-28');
    $owner = User::factory()->create();
    Academy::factory()->create(['user_id' => $owner->id]);

    $otherOwner = User::factory()->create();
    $otherAcademy = Academy::factory()->create(['user_id' => $otherOwner->id]);
    $foreignSchedule = $otherAcademy->schedules()->create([
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-06-01',
    ]);

    Sanctum::actingAs($owner);

    $this->deleteJson("/api/v1/academy/schedules/{$foreignSchedule->id}")
        ->assertNotFound();

    expect(AcademySchedule::find($foreignSchedule->id))->not->toBeNull();
});

it('returns 401 on DELETE without auth', function (): void {
    $this->deleteJson('/api/v1/academy/schedules/1')->assertUnauthorized();
});
