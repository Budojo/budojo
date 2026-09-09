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

beforeEach(function (): void {
    // Frozen deliberately (#1484). These assertions are about where a date
    // falls relative to a season boundary, and run on a real clock they pass
    // or fail depending on the month someone runs them in — in September the
    // season start and the month start are the same day, and every
    // "earlier in the season" case collapses onto "this month".
    $this->travelTo(CarbonImmutable::create(2026, 3, 15));

    $this->user = User::factory()->create();
    $this->academy = Academy::factory()->create(['user_id' => $this->user->id]);
    Sanctum::actingAs($this->user);
});

function athleteNamed(Academy $academy, string $lastName): Athlete
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

/**
 * @param  list<string>  $days  `Y-m-d` strings
 */
function attendedOn(Athlete $athlete, array $days): void
{
    foreach ($days as $day) {
        AttendanceRecord::factory()->create([
            'athlete_id' => $athlete->id,
            'attended_on' => $day,
        ]);
    }
}

it('counts this month and this season separately', function (): void {
    // Both sessions this month, plus one earlier in the same season — so the
    // month is a strict subset of the season rather than a different window.
    $athlete = athleteNamed($this->academy, 'Rossi');
    attendedOn($athlete, [
        '2026-03-02',
        '2026-03-04',
        // Earlier in the same season — September is the default boundary, so
        // the 2025/26 season runs from 1 Sep 2025.
        '2025-10-07',
    ]);

    $row = $this->getJson('/api/v1/athletes')->json('data.0');

    expect($row['attendance_month_count'])->toBe(2)
        ->and($row['attendance_total_count'])->toBe(3);
});

it('counts both ends of the month and neither day outside it', function (): void {
    // The month scope is a date range rather than whereYear+whereMonth, which
    // keeps the predicate sargable — see the comment in AthleteController and
    // the same reasoning in GetMonthlyAttendanceSummaryAction. A range is only
    // worth having if its edges are exact, so both are pinned here.
    $athlete = athleteNamed($this->academy, 'Rossi');
    attendedOn($athlete, [
        now()->subMonth()->endOfMonth()->toDateString(),
        now()->startOfMonth()->toDateString(),
        now()->endOfMonth()->toDateString(),
        now()->addMonth()->startOfMonth()->toDateString(),
    ]);

    $row = $this->getJson('/api/v1/athletes')->json('data.0');

    // All four dates sit inside the 2025/26 season (1 Sep 2025 - 31 Aug 2026),
    // so the season total sees every one of them while the month sees two.
    expect($row['attendance_month_count'])->toBe(2)
        ->and($row['attendance_total_count'])->toBe(4);
});

it('reports zero for an athlete who has never trained', function (): void {
    athleteNamed($this->academy, 'Rossi');

    $row = $this->getJson('/api/v1/athletes')->json('data.0');

    expect($row['attendance_month_count'])->toBe(0)
        ->and($row['attendance_total_count'])->toBe(0);
});

it('does not count a day that was corrected away', function (): void {
    // A mistake is fixed by soft-deleting the record and re-inserting, which
    // is the only reason there is no DB-level unique index on (athlete, day) —
    // see the create_attendance_records migration. If the count did not honour
    // the SoftDeletes scope, correcting a mistake would inflate the roster.
    $athlete = athleteNamed($this->academy, 'Rossi');
    $day = now()->startOfMonth()->toDateString();
    attendedOn($athlete, [$day]);
    AttendanceRecord::query()->where('athlete_id', $athlete->id)->delete();
    attendedOn($athlete, [$day]);

    $row = $this->getJson('/api/v1/athletes')->json('data.0');

    expect($row['attendance_month_count'])->toBe(1)
        ->and($row['attendance_total_count'])->toBe(1);
});

it('counts only the athlete their own sessions belong to', function (): void {
    $rossi = athleteNamed($this->academy, 'Rossi');
    $bianchi = athleteNamed($this->academy, 'Bianchi');
    attendedOn($rossi, [now()->startOfMonth()->toDateString()]);

    $rows = collect($this->getJson('/api/v1/athletes?sort_by=last_name&sort_order=asc')->json('data'))
        ->keyBy('last_name');

    expect($rows['Rossi']['attendance_month_count'])->toBe(1)
        ->and($rows['Bianchi']['attendance_month_count'])->toBe(0);
});

it('sorts by the current month count', function (): void {
    $quiet = athleteNamed($this->academy, 'Quiet');
    $busy = athleteNamed($this->academy, 'Busy');
    attendedOn($busy, [
        now()->startOfMonth()->toDateString(),
        now()->startOfMonth()->addDay()->toDateString(),
    ]);
    attendedOn($quiet, [now()->startOfMonth()->toDateString()]);

    $names = collect($this->getJson('/api/v1/athletes?sort_by=attendance_month&sort_order=desc')
        ->json('data'))
        ->pluck('last_name')
        ->all();

    expect($names)->toBe(['Busy', 'Quiet']);
});

it('counts the season, not the athlete\'s whole history', function (): void {
    // The default season starts 1 September, so "last season" is a year that
    // has already closed and must not be added in.
    $athlete = athleteNamed($this->academy, 'Rossi');
    $athlete->update(['joined_at' => '2023-01-10']);
    attendedOn($athlete, [
        '2024-11-20',  // two seasons ago
        '2025-06-02',  // last season, before the September boundary
        '2025-09-01',  // this season's first day
        '2026-03-02',  // this season, this month
        '2026-08-31',  // this season's last day
        '2026-09-01',  // NEXT season's first day — the upper bound
    ]);

    $row = $this->getJson('/api/v1/athletes')->json('data.0');

    // Only the three inside 2025/26. Both bounds are pinned: the two before
    // 1 Sep 2025 belong to seasons nobody is asking about, and the one on
    // 1 Sep 2026 belongs to the season that has not started yet.
    expect($row['attendance_total_count'])->toBe(3);
});

it('does not credit an athlete with sessions held before they joined', function (): void {
    // Someone who joined in the middle of the season cannot have attended
    // what happened before them. Counting from the season start regardless
    // would report the academy's calendar as if it were their record.
    $late = athleteNamed($this->academy, 'Late');
    $late->update(['joined_at' => '2026-03-01']);

    attendedOn($late, [
        // Inside the season but before this athlete existed — the fixture can
        // write one even though the app would not.
        '2025-10-07',
        // The day they joined: counted, and the case that broke when
        // `joined_at`'s cast wrote a time component onto a DATE column.
        '2026-03-01',
    ]);

    $row = $this->getJson('/api/v1/athletes')->json('data.0');

    expect($row['attendance_total_count'])->toBe(1);
});

it('sorts by the all-time count independently of this month', function (): void {
    // The two columns answer different questions, and the athlete who has
    // trained for years but skipped this month is exactly where they diverge.
    $veteran = athleteNamed($this->academy, 'Veteran');
    $newcomer = athleteNamed($this->academy, 'Newcomer');
    // Three sessions earlier in the SAME season, so the veteran leads on the
    // season total while the newcomer leads on the month.
    attendedOn($veteran, ['2025-09-01', '2025-09-03', '2025-10-07']);
    attendedOn($newcomer, ['2026-03-02']);

    $byMonth = collect($this->getJson('/api/v1/athletes?sort_by=attendance_month&sort_order=desc')
        ->json('data'))->pluck('last_name')->all();
    $byTotal = collect($this->getJson('/api/v1/athletes?sort_by=attendance_total&sort_order=desc')
        ->json('data'))->pluck('last_name')->all();

    expect($byMonth)->toBe(['Newcomer', 'Veteran'])
        ->and($byTotal)->toBe(['Veteran', 'Newcomer']);
});

it('breaks count ties by name so paging cannot drop or repeat a row', function (): void {
    // Counts are small integers over a roster of hundreds, so ties are the
    // common case. Without a stable second key the tied block reorders itself
    // between requests and an athlete can land on two pages or none.
    foreach (['Rossi', 'Bianchi', 'Verdi', 'Anselmi'] as $name) {
        athleteNamed($this->academy, $name);
    }

    $first = collect($this->getJson('/api/v1/athletes?sort_by=attendance_month&sort_order=desc')
        ->json('data'))->pluck('last_name')->all();
    $second = collect($this->getJson('/api/v1/athletes?sort_by=attendance_month&sort_order=desc')
        ->json('data'))->pluck('last_name')->all();

    expect($first)->toBe(['Anselmi', 'Bianchi', 'Rossi', 'Verdi'])
        ->and($second)->toBe($first);
});

it('keeps the tiebreak ascending when the count sorts ascending', function (): void {
    // The names are a stable key, not a second dimension the user asked to
    // reverse — flipping them with the count would make "least sessions" list
    // people backwards for no reason they could name.
    foreach (['Rossi', 'Bianchi'] as $name) {
        athleteNamed($this->academy, $name);
    }

    $names = collect($this->getJson('/api/v1/athletes?sort_by=attendance_month&sort_order=asc')
        ->json('data'))->pluck('last_name')->all();

    expect($names)->toBe(['Bianchi', 'Rossi']);
});

it('leaves the counts null on show, where they are not selected', function (): void {
    $athlete = athleteNamed($this->academy, 'Rossi');
    attendedOn($athlete, [now()->startOfMonth()->toDateString()]);

    $row = $this->getJson("/api/v1/athletes/{$athlete->id}")->json('data');

    // Null is "not asked for". Zero would be indistinguishable from someone
    // who has genuinely never trained.
    expect($row['attendance_month_count'])->toBeNull()
        ->and($row['attendance_total_count'])->toBeNull();
});
