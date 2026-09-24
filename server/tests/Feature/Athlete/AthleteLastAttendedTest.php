<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;

/*
 * Last presence on the roster (#1726): when an athlete last trained, as a
 * read-side aggregate on `GET /athletes` and `GET /athletes/{id}`, and as a
 * sort that puts the unknown (never trained) last in both directions.
 */

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::create(2026, 3, 15));

    $this->user = User::factory()->create();
    $this->academy = Academy::factory()->create(['user_id' => $this->user->id]);
    Sanctum::actingAs($this->user);
});

function lastSeenAthlete(Academy $academy, string $lastName): Athlete
{
    return Athlete::factory()->create([
        'academy_id' => $academy->id,
        'first_name' => 'Athlete',
        'last_name' => $lastName,
        'belt' => Belt::White,
        'stripes' => 0,
        'status' => AthleteStatus::Active,
        'joined_at' => now()->subYears(2),
    ]);
}

function presentOn(Athlete $athlete, string $day): AttendanceRecord
{
    return AttendanceRecord::factory()->create([
        'athlete_id' => $athlete->id,
        'attended_on' => $day,
    ]);
}

/**
 * @return array<string, string|null> last name => last_attended_on, in response order
 */
function lastSeenByName(mixed $rows): array
{
    assert(is_array($rows));
    $out = [];
    foreach ($rows as $row) {
        assert(is_array($row));
        $out[(string) $row['last_name']] = $row['last_attended_on'];
    }

    return $out;
}

it('returns the date of the latest presence on the index and on show', function (): void {
    $athlete = lastSeenAthlete($this->academy, 'Rossi');
    presentOn($athlete, '2026-01-10');
    presentOn($athlete, '2026-02-03');
    presentOn($athlete, '2025-11-20');

    $row = $this->getJson('/api/v1/athletes')->json('data.0');
    $shown = $this->getJson("/api/v1/athletes/{$athlete->id}")->json('data');

    expect($row['last_attended_on'])->toBe('2026-02-03')
        ->and($shown['last_attended_on'])->toBe('2026-02-03');
});

it('reads a presence from a previous season too — a date is not floored at the season', function (): void {
    // The season count (#1484) is floored; a last-seen date is not. Someone who
    // last trained in May of the previous season still has a last presence.
    $athlete = lastSeenAthlete($this->academy, 'Rossi');
    presentOn($athlete, '2025-05-20');

    expect($this->getJson('/api/v1/athletes')->json('data.0.last_attended_on'))->toBe('2025-05-20');
});

it('is null for an athlete who has never trained, on both endpoints', function (): void {
    $athlete = lastSeenAthlete($this->academy, 'Rossi');

    expect($this->getJson('/api/v1/athletes')->json('data.0.last_attended_on'))->toBeNull()
        ->and($this->getJson("/api/v1/athletes/{$athlete->id}")->json('data.last_attended_on'))->toBeNull();
});

it('ignores a presence that was corrected away', function (): void {
    // The SoftDeletes global scope is what makes this true. A `withTrashed()`
    // on the aggregate would report the deleted evening as the last one.
    $athlete = lastSeenAthlete($this->academy, 'Rossi');
    presentOn($athlete, '2026-03-01')->delete();

    expect($this->getJson('/api/v1/athletes')->json('data.0.last_attended_on'))->toBeNull()
        ->and($this->getJson("/api/v1/athletes/{$athlete->id}")->json('data.last_attended_on'))->toBeNull();
});

it('is absent, not null, from a payload that did not select it', function (): void {
    // `null` means "never trained". An endpoint that did not ask — the update
    // below, the photo endpoints, search — must not say that about someone
    // who trained yesterday, so the key is left out rather than nulled.
    $athlete = lastSeenAthlete($this->academy, 'Rossi');
    presentOn($athlete, '2026-03-13');

    $data = $this->putJson("/api/v1/athletes/{$athlete->id}", ['stripes' => 1])->assertOk()->json('data');

    expect($data)->not->toHaveKey('last_attended_on');
});

it('sorts the longest-absent first on asc, and the never-trained last', function (): void {
    presentOn(lastSeenAthlete($this->academy, 'Recent'), now()->subDays(2)->toDateString());
    lastSeenAthlete($this->academy, 'Never');
    presentOn(lastSeenAthlete($this->academy, 'Gone'), now()->subDays(40)->toDateString());

    $rows = $this->getJson('/api/v1/athletes?sort_by=last_seen&sort_order=asc')->json('data');

    expect(lastSeenByName($rows))->toBe([
        'Gone' => '2026-02-03',
        'Recent' => '2026-03-13',
        'Never' => null,
    ]);
});

it('sorts the most recent first on desc, and the never-trained still last', function (): void {
    presentOn(lastSeenAthlete($this->academy, 'Recent'), now()->subDays(2)->toDateString());
    lastSeenAthlete($this->academy, 'Never');
    presentOn(lastSeenAthlete($this->academy, 'Gone'), now()->subDays(40)->toDateString());

    $rows = $this->getJson('/api/v1/athletes?sort_by=last_seen&sort_order=desc')->json('data');

    expect(array_keys(lastSeenByName($rows)))->toBe(['Recent', 'Gone', 'Never']);
});

it('breaks a tie on the same last day by name', function (): void {
    presentOn(lastSeenAthlete($this->academy, 'Zeta'), '2026-03-02');
    presentOn(lastSeenAthlete($this->academy, 'Alfa'), '2026-03-02');

    $rows = $this->getJson('/api/v1/athletes?sort_by=last_seen&sort_order=desc')->json('data');

    expect(array_keys(lastSeenByName($rows)))->toBe(['Alfa', 'Zeta']);
});
