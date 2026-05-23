<?php

declare(strict_types=1);

use App\Actions\Engagement\BuildWeeklyRecapAction;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use App\Notifications\WeeklyRecapNotification;
use App\Support\NotificationCategory;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Notification;

/**
 * Weekly recap (#960) — aggregation Action + Sunday fanout command.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

/**
 * @return array{User, Athlete}
 */
function authedRecapAthlete(Academy $academy): array
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);

    return [$user, $athlete];
}

// ─── BuildWeeklyRecapAction ─────────────────────────────────────

it('counts distinct sessions in the iso week (Mon-Sun inclusive)', function (): void {
    [, $athlete] = authedRecapAthlete($this->academy);
    // Pick a fixed week: 2026-05-18 is a Monday.
    $weekStart = CarbonImmutable::parse('2026-05-18');
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-05-18']);
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-05-20']);
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-05-24']);
    // Out-of-window row excluded.
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-05-17']);

    $recap = app(BuildWeeklyRecapAction::class)->execute($athlete, $weekStart);

    expect($recap->sessions)->toBe(3);
    expect($recap->hours)->toBe(4.5); // 3 × 1.5h
});

it('returns zero sessions + empty partners when the athlete never trained', function (): void {
    [, $athlete] = authedRecapAthlete($this->academy);
    $weekStart = CarbonImmutable::parse('2026-05-18');

    $recap = app(BuildWeeklyRecapAction::class)->execute($athlete, $weekStart);

    expect($recap->sessions)->toBe(0);
    expect($recap->hours)->toBe(0.0);
    expect($recap->partners)->toBe([]);
});

it('ranks training partners by overlap-day count, descending', function (): void {
    [, $athlete] = authedRecapAthlete($this->academy);
    [, $partnerA] = authedRecapAthlete($this->academy);
    [, $partnerB] = authedRecapAthlete($this->academy);
    $weekStart = CarbonImmutable::parse('2026-05-18');

    // Self trained Mon + Wed + Fri.
    foreach (['2026-05-18', '2026-05-20', '2026-05-22'] as $d) {
        AttendanceRecord::factory()->for($athlete)->create(['attended_on' => $d]);
    }
    // PartnerA overlapped on 2 days (Mon, Wed).
    foreach (['2026-05-18', '2026-05-20'] as $d) {
        AttendanceRecord::factory()->for($partnerA)->create(['attended_on' => $d]);
    }
    // PartnerB overlapped on 1 day (Fri).
    AttendanceRecord::factory()->for($partnerB)->create(['attended_on' => '2026-05-22']);

    $recap = app(BuildWeeklyRecapAction::class)->execute($athlete, $weekStart);

    expect($recap->partners[0]['first_name'])->toBe($partnerA->first_name);
    expect($recap->partners[1]['first_name'])->toBe($partnerB->first_name);
});

it('emits last_name_initial (NOT full last_name) for each partner', function (): void {
    [, $athlete] = authedRecapAthlete($this->academy);
    [, $partner] = authedRecapAthlete($this->academy);
    $partner->update(['last_name' => 'Bianchi']);
    $weekStart = CarbonImmutable::parse('2026-05-18');

    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-05-18']);
    AttendanceRecord::factory()->for($partner)->create(['attended_on' => '2026-05-18']);

    $recap = app(BuildWeeklyRecapAction::class)->execute($athlete, $weekStart);

    expect($recap->partners[0]['last_name_initial'])->toBe('B');
    expect($recap->partners[0])->not->toHaveKey('last_name');
});

it('caps partners at 3', function (): void {
    [, $athlete] = authedRecapAthlete($this->academy);
    $weekStart = CarbonImmutable::parse('2026-05-18');
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-05-18']);

    // 5 peers all training the same day → cap is 3.
    for ($i = 0; $i < 5; $i++) {
        [, $partner] = authedRecapAthlete($this->academy);
        AttendanceRecord::factory()->for($partner)->create(['attended_on' => '2026-05-18']);
    }

    $recap = app(BuildWeeklyRecapAction::class)->execute($athlete, $weekStart);
    expect($recap->partners)->toHaveCount(3);
});

it('excludes partners from OTHER academies even on overlapping days', function (): void {
    [, $athlete] = authedRecapAthlete($this->academy);
    $otherAcademy = userWithAcademy()->academy;
    [, $otherAthlete] = authedRecapAthlete($otherAcademy);
    $weekStart = CarbonImmutable::parse('2026-05-18');

    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-05-18']);
    AttendanceRecord::factory()->for($otherAthlete)->create(['attended_on' => '2026-05-18']);

    $recap = app(BuildWeeklyRecapAction::class)->execute($athlete, $weekStart);
    expect($recap->partners)->toBe([]);
});

// ─── SendWeeklyRecapPushes command ──────────────────────────────

it('skips athletes with zero sessions in the week (no pity push)', function (): void {
    Notification::fake();
    [, $athlete] = authedRecapAthlete($this->academy);
    // No attendance rows at all.

    $this->artisan('budojo:send-weekly-recap-pushes')->assertExitCode(0);

    Notification::assertNothingSent();
});

it('pushes a WeeklyRecapNotification to athletes with ≥1 session', function (): void {
    Notification::fake();
    [$user, $athlete] = authedRecapAthlete($this->academy);
    // Pin the date so the command's "this week" window catches it.
    $today = CarbonImmutable::now();
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => $today->toDateString()]);

    $this->artisan('budojo:send-weekly-recap-pushes')->assertExitCode(0);

    Notification::assertSentTo($user, WeeklyRecapNotification::class);
});

it('respects WEEKLY_RECAP opt-out', function (): void {
    Notification::fake();
    [$user, $athlete] = authedRecapAthlete($this->academy);
    $today = CarbonImmutable::now();
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => $today->toDateString()]);
    $user->update([
        'notification_preferences' => [NotificationCategory::WEEKLY_RECAP => false],
    ]);

    $this->artisan('budojo:send-weekly-recap-pushes')->assertExitCode(0);

    Notification::assertNothingSent();
});

it('does not push again when a notification for the same iso week already exists (dedup)', function (): void {
    Notification::fake();
    [$user, $athlete] = authedRecapAthlete($this->academy);
    $today = CarbonImmutable::now();
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => $today->toDateString()]);

    // Seed a prior notification row that mimics a previous fanout's
    // database write. The command's alreadyNotifiedThisWeek() check
    // must find this and skip — without it, the cron would double-push
    // on a Monday-morning manual rerun. Using a raw insert avoids the
    // notify() path (which Notification::fake would intercept).
    $weekStart = CarbonImmutable::now()->startOfWeek(CarbonImmutable::MONDAY);
    $user->notifications()->create([
        'id' => (string) \Illuminate\Support\Str::uuid(),
        'type' => \App\Notifications\WeeklyRecapNotification::class,
        'data' => [
            'kind' => 'weekly_recap',
            'iso_week_start' => $weekStart->toDateString(),
        ],
    ]);

    $this->artisan('budojo:send-weekly-recap-pushes')->assertExitCode(0);

    Notification::assertNothingSent();
});

// ─── GET /api/v1/me/recap ────────────────────────────────────────

it('GET /me/recap returns the recap data for the requested ISO week', function (): void {
    [$user, $athlete] = authedRecapAthlete($this->academy);
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-05-18']);
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-05-20']);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/recap?week=2026-05-18')
        ->assertOk();

    expect($response->json('data.iso_week_start'))->toBe('2026-05-18');
    expect($response->json('data.sessions'))->toBe(2);
    // JSON serialises a clean float as int — `3.0` → `3` on the wire.
    expect((float) $response->json('data.hours'))->toBe(3.0);
});

it('GET /me/recap returns 422 when week param is missing', function (): void {
    [$user] = authedRecapAthlete($this->academy);

    $this->actingAs($user)
        ->getJson('/api/v1/me/recap')
        ->assertStatus(422);
});

it('GET /me/recap returns 422 when week param is not a Monday', function (): void {
    [$user] = authedRecapAthlete($this->academy);

    // 2026-05-20 is a Wednesday.
    $this->actingAs($user)
        ->getJson('/api/v1/me/recap?week=2026-05-20')
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Week parameter must be a Monday.']);
});

it('GET /me/recap returns 422 on malformed week (silent-overflow guard)', function (): void {
    [$user] = authedRecapAthlete($this->academy);

    $this->actingAs($user)
        ->getJson('/api/v1/me/recap?week=2026-13-99')
        ->assertStatus(422);
});

it('GET /me/recap returns 404 for owners (no athlete row)', function (): void {
    $this->actingAs($this->owner)
        ->getJson('/api/v1/me/recap?week=2026-05-18')
        ->assertStatus(404);
});

it('GET /me/recap rejects unauthenticated callers with 401', function (): void {
    $this->getJson('/api/v1/me/recap?week=2026-05-18')->assertStatus(401);
});

it('skips users with no linked user account', function (): void {
    Notification::fake();
    // Athlete without user_id — invitation pending state.
    Athlete::factory()->for($this->academy)->create(['user_id' => null]);
    $athlete = Athlete::query()->latest()->first();
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => CarbonImmutable::now()->toDateString()]);

    $this->artisan('budojo:send-weekly-recap-pushes')->assertExitCode(0);

    Notification::assertNothingSent();
});
