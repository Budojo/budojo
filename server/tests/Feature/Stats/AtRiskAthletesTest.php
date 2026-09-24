<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\CarbonImmutable;

// helpers live in tests/Pest.php

/**
 * Who is drifting (#1728), measured against each athlete's own habit and in
 * sessions the academy actually held — never against a fixed number, and never
 * in calendar weeks, which a closed August would read as everyone vanishing.
 */
beforeEach(function (): void {
    $this->travelTo('2026-09-24 10:00:00');
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;

    // 32 realised sessions, every other day back from yesterday, made real by
    // a regular who came to every one of them.
    $this->sessions = atRiskSessionDates(32);
    $this->regular = atRiskAthlete($this->academy, 'Regular');
    atRiskPresent($this->regular, $this->sessions);
});

/** @return list<string> newest first, `Y-m-d` */
function atRiskSessionDates(int $count): array
{
    $out = [];
    for ($i = 0; $i < $count; $i++) {
        $out[] = CarbonImmutable::parse('2026-09-23')->subDays(2 * $i)->toDateString();
    }

    return $out;
}

function atRiskAthlete(
    Academy $academy,
    string $lastName,
    string $joinedAt = '2024-01-10',
    AthleteStatus $status = AthleteStatus::Active,
): Athlete {
    return Athlete::factory()->for($academy)->create([
        'first_name' => 'Athlete',
        'last_name' => $lastName,
        'joined_at' => $joinedAt,
        'status' => $status,
        'phone_country_code' => '+39',
        'phone_national_number' => '3331234567',
    ]);
}

/** @param list<string> $days */
function atRiskPresent(Athlete $athlete, array $days): void
{
    foreach ($days as $day) {
        AttendanceRecord::factory()->create(['athlete_id' => $athlete->id, 'attended_on' => $day]);
    }
}

/**
 * The sessions at these positions, 0 being the most recent.
 *
 * @param  list<string>  $sessions
 * @param  list<int>  $indexes
 * @return list<string>
 */
function atRiskAt(array $sessions, array $indexes): array
{
    return array_values(array_map(static fn (int $i): string => $sessions[$i], $indexes));
}

/** @return array{data: list<array<string, mixed>>, meta: array<string, mixed>} */
function atRiskResponse(object $test): array
{
    /** @var array{data: list<array<string, mixed>>, meta: array<string, mixed>} */
    return $test->actingAs($test->user)
        ->getJson('/api/v1/stats/attendance/at-risk')
        ->assertOk()
        ->json();
}

/** @return array<string, string> last name => tier, in response order */
function atRiskTiers(object $test): array
{
    $out = [];
    foreach (atRiskResponse($test)['data'] as $row) {
        $out[(string) $row['athlete']['last_name']] = (string) $row['tier'];
    }

    return $out;
}

it('leaves out an athlete who came to every one of the last 8 sessions', function (): void {
    $response = atRiskResponse($this);

    expect($response['data'])->toBe([])
        ->and($response['meta'])->toBe(['sessions_available' => 32, 'sessions_needed' => 20]);
});

it('flags a drop against the athlete\'s own baseline, with the numbers that say why', function (): void {
    $athlete = atRiskAthlete($this->academy, 'Dropping');
    atRiskPresent($athlete, atRiskAt($this->sessions, [0, ...range(8, 21)]));

    $row = atRiskResponse($this)['data'][0];

    expect($row['tier'])->toBe('dropping')
        ->and($row['recent_attended'])->toBe(1)
        ->and($row['recent_sessions'])->toBe(8)
        ->and($row['baseline_attended'])->toBe(14)
        ->and($row['baseline_sessions'])->toBe(24)
        ->and($row['last_attended_on'])->toBe('2026-09-23')
        ->and($row['athlete'])->toMatchArray([
            'id' => $athlete->id,
            'last_name' => 'Dropping',
            'phone_country_code' => '+39',
            'phone_national_number' => '3331234567',
        ]);
});

it('compares an athlete with their own history, not with a fixed number', function (): void {
    // The load-bearing case. Both came to 2 of the last 8. One used to come
    // to 14 of 24 and is sliding; the other has always come to about 1 in 4
    // and is exactly where they always are. Any absolute cutoff flags both or
    // neither.
    $sliding = atRiskAthlete($this->academy, 'Sliding');
    atRiskPresent($sliding, atRiskAt($this->sessions, [0, 4, ...range(8, 21)]));
    $steady = atRiskAthlete($this->academy, 'Steady');
    atRiskPresent($steady, atRiskAt($this->sessions, [0, 4, 8, 12, 16, 20, 24, 28]));
    // The same habit, three sessions out of phase: last seen a week ago, none
    // of the last 3. Someone who comes once in four is not "quiet" for having
    // missed three — that is their normal week (#1728 prereview).
    $offset = atRiskAthlete($this->academy, 'SteadyOffset');
    atRiskPresent($offset, atRiskAt($this->sessions, [3, 7, 11, 15, 19, 23, 27, 31]));

    expect(atRiskTiers($this))->toBe(['Sliding' => 'dropping']);
});

it('does not count tonight against anyone who has not been ticked yet', function (): void {
    // Today becomes a session the moment the first person is checked in. An
    // athlete not ticked YET is not absent from a session still in progress.
    atRiskPresent($this->regular, ['2026-09-24']);
    $notYet = atRiskAthlete($this->academy, 'NotYet');
    atRiskPresent($notYet, atRiskAt($this->sessions, [2, 3, 4, 5, ...range(8, 21)]));

    expect(atRiskTiers($this))->toBe([]);
});

it('takes someone off the list the evening they are ticked', function (): void {
    // None of the last 3 before tonight — quiet. Checked in tonight: back.
    $back = atRiskAthlete($this->academy, 'Back');
    atRiskPresent($back, atRiskAt($this->sessions, [3, 4, 5, 6, ...range(8, 21)]));
    expect(atRiskTiers($this))->toBe(['Back' => 'quiet']);

    atRiskPresent($back, ['2026-09-24']);
    atRiskPresent($this->regular, ['2026-09-24']);

    expect(atRiskTiers($this))->toBe([]);
});

it('needs six presences in the baseline before it calls anything a drop', function (): void {
    // Joined so that twenty sessions fall on or after their first day: a
    // twelve-session baseline, the shortest the rules accept.
    $joined = $this->sessions[19];
    $six = atRiskAthlete($this->academy, 'Six', $joined);
    atRiskPresent($six, atRiskAt($this->sessions, [0, 8, 10, 12, 14, 16, 18]));
    $five = atRiskAthlete($this->academy, 'Five', $joined);
    atRiskPresent($five, atRiskAt($this->sessions, [0, 8, 10, 12, 14, 16]));

    expect(atRiskTiers($this))->toBe(['Six' => 'dropping']);
});

it('says nothing about an athlete with fewer than twelve sessions of baseline', function (): void {
    // Nineteen sessions since they joined: eleven of baseline. Never came, and
    // still not enough of their history to say anything about.
    atRiskAthlete($this->academy, 'Short', $this->sessions[18]);

    expect(atRiskTiers($this))->toBe([]);
});

it('never lists an inactive athlete', function (): void {
    atRiskAthlete($this->academy, 'Inactive', status: AthleteStatus::Inactive);

    expect(atRiskTiers($this))->toBe([]);
});

it('leaves out anyone who joined in the last 28 days, and only them', function (): void {
    // A session every day for a month, so both newcomers have far more than
    // the twenty sessions the other floors ask for: only the 28-day rule can
    // keep the first one off the list.
    $daily = [];
    for ($i = 1; $i <= 30; $i++) {
        $daily[] = CarbonImmutable::parse('2026-09-24')->subDays($i)->toDateString();
    }
    atRiskPresent($this->regular, $daily);
    atRiskAthlete($this->academy, 'JoinedTwentyFiveDaysAgo', '2026-08-30');
    atRiskAthlete($this->academy, 'JoinedTwentyNineDaysAgo', '2026-08-26');

    expect(atRiskTiers($this))->toBe(['JoinedTwentyNineDaysAgo' => 'gone']);
});

it('gives the most severe tier, as one value', function (): void {
    // Gone also qualifies as quiet and as dropping; quiet-and-dropping is quiet.
    $gone = atRiskAthlete($this->academy, 'Gone');
    atRiskPresent($gone, atRiskAt($this->sessions, range(12, 25)));
    $quiet = atRiskAthlete($this->academy, 'Quiet');
    atRiskPresent($quiet, atRiskAt($this->sessions, [5, ...range(8, 21)]));

    $data = atRiskResponse($this)['data'];

    expect(array_map(static fn (array $row): mixed => $row['tier'], $data))->toBe(['gone', 'quiet'])
        ->and($data[0]['last_attended_on'])->toBe($this->sessions[12]);
});

it('calls it quiet, not gone, when the last presence is within three weeks', function (): void {
    // None of the last eight, but seen seventeen days ago.
    $athlete = atRiskAthlete($this->academy, 'Recent');
    atRiskPresent($athlete, atRiskAt($this->sessions, range(8, 21)));

    expect(atRiskTiers($this))->toBe(['Recent' => 'quiet']);
});

it('reads an athlete who has never come since joining as gone', function (): void {
    atRiskAthlete($this->academy, 'Never');

    $row = atRiskResponse($this)['data'][0];

    expect($row['tier'])->toBe('gone')
        ->and($row['last_attended_on'])->toBeNull()
        ->and($row['recent_attended'])->toBe(0);
});

it('sorts gone, quiet, dropping — and within a tier, the longest absent first', function (): void {
    atRiskPresent(atRiskAthlete($this->academy, 'DropB'), atRiskAt($this->sessions, [0, ...range(8, 21)]));
    atRiskPresent(atRiskAthlete($this->academy, 'GoneRecent'), atRiskAt($this->sessions, range(12, 25)));
    atRiskPresent(atRiskAthlete($this->academy, 'QuietA'), atRiskAt($this->sessions, [5, ...range(8, 21)]));
    atRiskPresent(atRiskAthlete($this->academy, 'GoneLong'), atRiskAt($this->sessions, range(18, 31)));

    expect(array_keys(atRiskTiers($this)))->toBe(['GoneLong', 'GoneRecent', 'QuietA', 'DropB']);
});

it('does not count a presence that was corrected away', function (): void {
    $athlete = atRiskAthlete($this->academy, 'Corrected');
    atRiskPresent($athlete, atRiskAt($this->sessions, range(8, 21)));
    AttendanceRecord::factory()->create([
        'athlete_id' => $athlete->id,
        'attended_on' => $this->sessions[0],
    ])->delete();

    expect(atRiskTiers($this))->toBe(['Corrected' => 'quiet']);
});

it('counts only this academy\'s sessions and athletes', function (): void {
    // Another academy trained every day this month. Those are not nights this
    // academy was open, and its athletes are not ours to list.
    $other = userWithAcademy()->academy;
    assert($other instanceof Academy);
    $theirs = atRiskAthlete($other, 'Theirs');
    atRiskPresent($theirs, atRiskSessionDates(40));
    atRiskAthlete($other, 'TheirsIdle');

    $response = atRiskResponse($this);

    expect($response['data'])->toBe([])
        ->and($response['meta']['sessions_available'])->toBe(32);
});

it('says how many sessions exist, so a young academy is not reported as healthy', function (): void {
    // Rebuild the academy with fifteen sessions only: below what the rules
    // need to say anything, and the client must be able to tell.
    AttendanceRecord::query()->forceDelete();
    atRiskPresent($this->regular, atRiskSessionDates(15));
    atRiskAthlete($this->academy, 'NeverCame');

    $response = atRiskResponse($this);

    expect($response['data'])->toBe([])
        ->and($response['meta'])->toBe(['sessions_available' => 15, 'sessions_needed' => 20]);
});

it('refuses an athlete account the way the other stats routes do', function (): void {
    $athlete = User::factory()->athlete()->create();

    $this->actingAs($athlete)->getJson('/api/v1/stats/attendance/at-risk')->assertStatus(403);
});
