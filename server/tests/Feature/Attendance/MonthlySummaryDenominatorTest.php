<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;

/**
 * #1767 — the month summary divides on the server, once per athlete: each
 * row's own scheduled days, floored at the day that athlete joined, closures
 * already out. The header's academy-wide count rides beside the rows and is
 * nobody's denominator.
 *
 * April 2026 on Mon/Wed/Fri is 13 sessions: 1, 3, 6, 8, 10, 13, 15, 17, 20,
 * 22, 24, 27 and 29. From the 20th on, five.
 */
beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
    $this->academy->schedules()->create(['training_days' => [1, 3, 5], 'effective_from' => '2026-01-01']);
    $this->travelTo(CarbonImmutable::parse('2026-05-10 12:00'));
});

function summaryAthlete(Academy $academy, string $joinedAt, string $attendedOn): Athlete
{
    $athlete = Athlete::factory()->for($academy)->create(['joined_at' => $joinedAt]);
    AttendanceRecord::factory()->for($athlete)->on($attendedOn)->create();

    return $athlete;
}

it('gives each athlete their own denominator, floored at the day they joined', function (): void {
    $longtime = summaryAthlete($this->academy, '2025-09-01', '2026-04-01');
    $newcomer = summaryAthlete($this->academy, '2026-04-20', '2026-04-22');

    $response = $this->actingAs($this->owner)->getJson('/api/v1/attendance/summary?month=2026-04')->assertOk();
    $rows = collect($response->json('data'))->keyBy('athlete_id');

    expect($rows[$longtime->id]['expected_count'])->toBe(13)
        ->and($rows[$newcomer->id]['expected_count'])->toBe(5)
        ->and($response->json('meta'))->toBe(['training_days' => 13, 'month' => '2026-04']);
});

it('leaves the days the academy was closed out of both numbers', function (): void {
    $athlete = summaryAthlete($this->academy, '2025-09-01', '2026-04-01');
    $this->academy->closures()->create(['starts_on' => '2026-04-13', 'ends_on' => '2026-04-17']);

    $response = $this->actingAs($this->owner)->getJson('/api/v1/attendance/summary?month=2026-04')->assertOk();

    expect($response->json('data.0.athlete_id'))->toBe($athlete->id)
        ->and($response->json('data.0.expected_count'))->toBe(10)
        ->and($response->json('meta.training_days'))->toBe(10);
});

it('stops the month in progress at today', function (): void {
    summaryAthlete($this->academy, '2025-09-01', '2026-05-04');

    $response = $this->actingAs($this->owner)->getJson('/api/v1/attendance/summary?month=2026-05')->assertOk();

    // May 2026 up to Sunday the 10th: Fri 1, Mon 4, Wed 6, Fri 8.
    expect($response->json('data.0.expected_count'))->toBe(4)
        ->and($response->json('meta.training_days'))->toBe(4);
});

it('sends null, not zero, when no schedule was ever configured', function (): void {
    $this->academy->schedules()->delete();
    $this->academy->schedules()->create(['training_days' => null, 'effective_from' => '2026-01-01']);
    summaryAthlete($this->academy, '2025-09-01', '2026-04-01');

    $response = $this->actingAs($this->owner)->getJson('/api/v1/attendance/summary?month=2026-04')->assertOk();

    expect($response->json('data.0.expected_count'))->toBeNull()
        ->and($response->json('meta'))->toBe(['training_days' => null, 'month' => '2026-04']);
});

it('reads the month asked for on the last day of a longer one', function (): void {
    // `createFromFormat('Y-m')` fills the day from today: on 31 March,
    // "2026-02" was 31 February, which is 3 March.
    $this->travelTo(CarbonImmutable::parse('2026-03-31 12:00'));
    summaryAthlete($this->academy, '2025-09-01', '2026-02-04');

    $response = $this->actingAs($this->owner)->getJson('/api/v1/attendance/summary?month=2026-02')->assertOk();

    // February 2026 on Mon/Wed/Fri: 12 sessions.
    expect($response->json('meta'))->toBe(['training_days' => 12, 'month' => '2026-02'])
        ->and($response->json('data.0.count'))->toBe(1);
});
