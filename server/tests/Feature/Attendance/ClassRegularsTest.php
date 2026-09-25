<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Enums\TrainingMode;
use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\AcademyMembership;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Testing\TestResponse;

// helpers live in tests/Pest.php

/**
 * Who usually comes to this class (#1730): the athletes present at three of
 * the class's last four occurrences. An occurrence is a day the academy held a
 * session on the class's weekday, so a year of check-ins recorded before the
 * timetable existed still counts — except where two classes share the weekday
 * and a presence names neither, which could have been at either.
 */
beforeEach(function (): void {
    // A Wednesday evening, before the gi class. The four Wednesdays before it:
    // 09-09, 09-02, 08-26, 08-19; the fifth is 08-12.
    $this->travelTo('2026-09-16 18:30:00');
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->gi = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Gi', 'weekday' => 3, 'starts_at' => '19:00', 'kind' => TrainingMode::Gi,
    ]);
});

function regularsAthlete(Academy $academy, string $lastName, AthleteStatus $status = AthleteStatus::Active): Athlete
{
    return Athlete::factory()->for($academy)->create([
        'first_name' => 'Athlete',
        'last_name' => $lastName,
        'status' => $status,
        'phone_country_code' => '+39',
        'phone_national_number' => '3331234567',
    ]);
}

/** @param list<string> $days */
function regularsPresent(Athlete $athlete, array $days, ?Lesson $lesson = null): void
{
    foreach ($days as $day) {
        AttendanceRecord::factory()->for($athlete)->create([
            'attended_on' => $day,
            'lesson_id' => $lesson?->id,
        ]);
    }
}

/** A lesson of the class on the day, with these athletes checked into it. */
function regularsHeld(AcademyClass $class, string $day, Athlete ...$athletes): Lesson
{
    $lesson = Lesson::factory()->forClass($class, $day)->create();
    foreach ($athletes as $athlete) {
        regularsPresent($athlete, [$day], $lesson);
    }

    return $lesson;
}

function regularsOf(mixed $test, AcademyClass $class, string $date = '2026-09-16'): TestResponse
{
    return $test->actingAs($test->user)
        ->getJson("/api/v1/attendance/regulars?date={$date}&academy_class_id={$class->id}")
        ->assertOk();
}

/** @return list<int> */
function regularIds(TestResponse $response): array
{
    /** @var list<array{id: int}> $rows */
    $rows = $response->json('data');

    return array_map(static fn (array $row): int => $row['id'], $rows);
}

// ─── Who is a regular ───────────────────────────────────────────────────────

it('counts three of the last four occurrences as a regular, and two as not', function (): void {
    $always = regularsAthlete($this->academy, 'Always');
    $three = regularsAthlete($this->academy, 'Three');
    $two = regularsAthlete($this->academy, 'Two');

    regularsPresent($always, ['2026-09-09', '2026-09-02', '2026-08-26', '2026-08-19']);
    regularsPresent($three, ['2026-09-09', '2026-09-02', '2026-08-26']);
    // The fifth Wednesday back is outside the window: counting it would make
    // this athlete three of five.
    regularsPresent($two, ['2026-09-09', '2026-08-19', '2026-08-12']);

    $response = regularsOf($this, $this->gi);

    expect(regularIds($response))->toBe([$always->id, $three->id])
        ->and($response->json('data.0.attended'))->toBe(4)
        ->and($response->json('data.1.attended'))->toBe(3)
        ->and($response->json('meta.occurrences'))->toBe(4)
        ->and($response->json('meta.occurrence_dates'))
        ->toBe(['2026-09-09', '2026-09-02', '2026-08-26', '2026-08-19']);
});

it('reads only the class weekday, and only the days before the one asked about', function (): void {
    $wednesdays = regularsAthlete($this->academy, 'Wednesdays');
    $mondays = regularsAthlete($this->academy, 'Mondays');

    regularsPresent($wednesdays, ['2026-09-09', '2026-09-02', '2026-08-26', '2026-08-19']);
    // Three Mondays are three sessions, but not of a Wednesday class: read as
    // one, they would make this athlete three of the last four.
    regularsPresent($mondays, ['2026-09-14', '2026-09-07', '2026-08-31', '2026-09-09']);
    // Tonight is the evening being checked in, not one of its own history.
    regularsPresent($mondays, ['2026-09-16']);

    $response = regularsOf($this, $this->gi);

    expect(regularIds($response))->toBe([$wednesdays->id])
        ->and($response->json('meta.occurrence_dates'))
        ->toBe(['2026-09-09', '2026-09-02', '2026-08-26', '2026-08-19']);
});

it('sends what the panel draws a regular with', function (): void {
    $marco = regularsAthlete($this->academy, 'Rossi');
    regularsPresent($marco, ['2026-09-09', '2026-09-02', '2026-08-26']);
    // A presence on another weekday is still their latest presence.
    regularsPresent($marco, ['2026-09-14']);

    regularsOf($this, $this->gi)
        ->assertJsonPath('data.0.id', $marco->id)
        ->assertJsonPath('data.0.first_name', 'Athlete')
        ->assertJsonPath('data.0.last_name', 'Rossi')
        ->assertJsonPath('data.0.belt', $marco->belt->value)
        ->assertJsonPath('data.0.stripes', $marco->stripes)
        ->assertJsonPath('data.0.phone_country_code', '+39')
        ->assertJsonPath('data.0.phone_national_number', '3331234567')
        ->assertJsonPath('data.0.attended', 3)
        ->assertJsonPath('data.0.last_attended_on', '2026-09-14')
        // The identity every list of people is drawn with (#1851).
        ->assertJsonStructure(['data' => [['date_of_birth', 'photo_url', 'user_avatar_url']]]);
});

it('says when an athlete was last seen before the evening asked about, not after it', function (): void {
    $marco = regularsAthlete($this->academy, 'Rossi');
    regularsPresent($marco, ['2026-09-02', '2026-08-26', '2026-08-19', '2026-09-09', '2026-09-14']);

    // Looking back at 09-09: the Monday after it has not happened yet.
    regularsOf($this, $this->gi, '2026-09-09')
        ->assertJsonPath('data.0.last_attended_on', '2026-09-02')
        ->assertJsonPath('meta.occurrence_dates', ['2026-09-02', '2026-08-26', '2026-08-19']);
});

it('lists the most regular first, then by name', function (): void {
    $bianchi = regularsAthlete($this->academy, 'Bianchi');
    $verdi = regularsAthlete($this->academy, 'Verdi');
    $azzurri = regularsAthlete($this->academy, 'Azzurri');

    regularsPresent($bianchi, ['2026-09-09', '2026-09-02', '2026-08-26']);
    regularsPresent($verdi, ['2026-09-09', '2026-09-02', '2026-08-26', '2026-08-19']);
    regularsPresent($azzurri, ['2026-09-09', '2026-09-02', '2026-08-19']);

    expect(regularIds(regularsOf($this, $this->gi)))->toBe([$verdi->id, $azzurri->id, $bianchi->id]);
});

it('leaves out athletes who are not active', function (): void {
    $active = regularsAthlete($this->academy, 'Active');
    $inactive = regularsAthlete($this->academy, 'Inactive', AthleteStatus::Inactive);
    $days = ['2026-09-09', '2026-09-02', '2026-08-26', '2026-08-19'];
    regularsPresent($active, $days);
    regularsPresent($inactive, $days);

    expect(regularIds(regularsOf($this, $this->gi)))->toBe([$active->id]);
});

it('ignores corrected presences and deleted athletes', function (): void {
    $marco = regularsAthlete($this->academy, 'Rossi');
    regularsPresent($marco, ['2026-09-09', '2026-09-02']);
    // A presence ticked by mistake and taken back is not an evening trained.
    AttendanceRecord::factory()->for($marco)->create(['attended_on' => '2026-08-26'])->delete();

    // The only person at 08-19 is gone: that Wednesday no longer happened.
    $gone = regularsAthlete($this->academy, 'Gone');
    regularsPresent($gone, ['2026-08-19', '2026-08-12', '2026-08-05']);
    $gone->delete();

    $response = regularsOf($this, $this->gi);

    expect(regularIds($response))->toBe([])
        ->and($response->json('meta.occurrence_dates'))->toBe(['2026-09-09', '2026-09-02']);
});

it('never reads another academy', function (): void {
    $marco = regularsAthlete($this->academy, 'Rossi');
    regularsPresent($marco, ['2026-09-09', '2026-09-02', '2026-08-26']);

    // Another academy trains on the Wednesdays this one had off.
    $other = Academy::factory()->create();
    regularsPresent(regularsAthlete($other, 'Elsewhere'), ['2026-08-19', '2026-08-12', '2026-08-05']);

    expect(regularsOf($this, $this->gi)->json('meta.occurrence_dates'))
        ->toBe(['2026-09-09', '2026-09-02', '2026-08-26']);
});

// ─── Not enough history ─────────────────────────────────────────────────────

it('names nobody from fewer than three occurrences, and says how many there were', function (): void {
    $marco = regularsAthlete($this->academy, 'Rossi');
    regularsPresent($marco, ['2026-09-09', '2026-09-02']);

    regularsOf($this, $this->gi)
        ->assertJsonPath('data', [])
        ->assertJsonPath('meta.occurrences', 2)
        ->assertJsonPath('meta.occurrence_dates', ['2026-09-09', '2026-09-02']);
});

it('needs a regular at every one of exactly three occurrences', function (): void {
    $all = regularsAthlete($this->academy, 'All');
    $twoOfThree = regularsAthlete($this->academy, 'TwoOfThree');
    regularsPresent($all, ['2026-09-09', '2026-09-02', '2026-08-26']);
    regularsPresent($twoOfThree, ['2026-09-09', '2026-09-02']);

    $response = regularsOf($this, $this->gi);

    expect(regularIds($response))->toBe([$all->id])
        ->and($response->json('meta.occurrences'))->toBe(3);
});

// ─── Two classes on one weekday ─────────────────────────────────────────────

it('drops a shared weekday on which nobody named a class', function (): void {
    // Gi and no-gi on the same Wednesday: a presence naming neither could have
    // been at either, and crediting it to one would be a guess.
    $noGi = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'No-gi', 'weekday' => 3, 'starts_at' => '20:30', 'kind' => TrainingMode::NoGi,
    ]);
    $gianni = regularsAthlete($this->academy, 'Gianni');
    $marco = regularsAthlete($this->academy, 'Marco');

    regularsHeld($this->gi, '2026-09-02', $gianni, $marco);
    regularsHeld($this->gi, '2026-08-26', $gianni, $marco);
    regularsHeld($this->gi, '2026-08-19', $gianni);
    regularsHeld($this->gi, '2026-08-12', $gianni);
    // The most recent Wednesday, checked in before the timetable said which.
    regularsPresent($gianni, ['2026-09-09']);
    regularsPresent($marco, ['2026-09-09']);

    $gi = regularsOf($this, $this->gi);

    // Credited, 09-09 would make Marco three of the last four.
    expect(regularIds($gi))->toBe([$gianni->id])
        ->and($gi->json('meta.occurrence_dates'))
        ->toBe(['2026-09-02', '2026-08-26', '2026-08-19', '2026-08-12']);

    // Nor is it the other class's: no-gi has never been checked into.
    regularsOf($this, $noGi)
        ->assertJsonPath('data', [])
        ->assertJsonPath('meta.occurrences', 0);
});

it('does not credit a presence naming no class on a shared weekday, even when the class was held', function (): void {
    AcademyClass::factory()->for($this->academy)->create([
        'name' => 'No-gi', 'weekday' => 3, 'starts_at' => '20:30', 'kind' => TrainingMode::NoGi,
    ]);
    $gianni = regularsAthlete($this->academy, 'Gianni');
    $marco = regularsAthlete($this->academy, 'Marco');

    regularsHeld($this->gi, '2026-09-09', $gianni);
    regularsHeld($this->gi, '2026-09-02', $gianni, $marco);
    regularsHeld($this->gi, '2026-08-26', $gianni, $marco);
    regularsHeld($this->gi, '2026-08-19', $gianni);
    // Gi was held on 09-09, but Marco's row says neither class: he may have
    // come for the no-gi.
    regularsPresent($marco, ['2026-09-09']);

    expect(regularIds(regularsOf($this, $this->gi)))->toBe([$gianni->id]);
});

it('stops at the evening another class held, and does not read the old timetable as this one', function (): void {
    // The timetable moved: Wednesdays used to be no-gi, which is now on
    // Thursdays. 08-26 names no-gi, so it and every evening before it were
    // no-gi's: 08-19 is the same story with no lesson to say so. Crediting it
    // would make Marco a regular of gi on the strength of a no-gi habit.
    $noGi = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'No-gi', 'weekday' => 4, 'starts_at' => '20:30', 'kind' => TrainingMode::NoGi,
    ]);
    $marco = regularsAthlete($this->academy, 'Marco');
    regularsPresent($marco, ['2026-09-09', '2026-09-02']);
    regularsHeld($noGi, '2026-08-26', $marco);
    regularsPresent($marco, ['2026-08-19', '2026-08-12']);

    regularsOf($this, $this->gi)
        ->assertJsonPath('data', [])
        ->assertJsonPath('meta.occurrences', 2)
        ->assertJsonPath('meta.occurrence_dates', ['2026-09-09', '2026-09-02']);
});

it('keeps walking past an evening only the class sharing its weekday held', function (): void {
    // Gi and no-gi share Wednesday. On 09-02 only no-gi ran: that says nothing
    // about when gi's history ends, so the walk goes on to find four of its own.
    $noGi = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'No-gi', 'weekday' => 3, 'starts_at' => '20:30', 'kind' => TrainingMode::NoGi,
    ]);
    $gianni = regularsAthlete($this->academy, 'Gianni');

    regularsHeld($this->gi, '2026-09-09', $gianni);
    regularsHeld($noGi, '2026-09-02', $gianni);
    regularsHeld($this->gi, '2026-08-26', $gianni);
    regularsHeld($this->gi, '2026-08-19', $gianni);
    regularsHeld($this->gi, '2026-08-12', $gianni);

    $response = regularsOf($this, $this->gi);

    expect($response->json('meta.occurrence_dates'))
        ->toBe(['2026-09-09', '2026-08-26', '2026-08-19', '2026-08-12'])
        ->and(regularIds($response))->toBe([$gianni->id]);
});

it('finds a Sunday class on Sundays', function (): void {
    // Carbon's `dayOfWeek` is 0 on Sunday, where `dayOfWeekIso` is 7: the two
    // agree six days in seven, and a Wednesday test cannot tell them apart.
    $openMat = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Open mat', 'weekday' => 0, 'starts_at' => '10:00', 'kind' => TrainingMode::Both,
    ]);
    $marco = regularsAthlete($this->academy, 'Marco');
    regularsPresent($marco, ['2026-09-13', '2026-09-06', '2026-08-30']);

    $response = regularsOf($this, $openMat);

    expect($response->json('meta.occurrence_dates'))->toBe(['2026-09-13', '2026-09-06', '2026-08-30'])
        ->and(regularIds($response))->toBe([$marco->id]);
});

// ─── The route ──────────────────────────────────────────────────────────────

it('is not read as an attendance record id', function (): void {
    $this->actingAs($this->user)
        ->getJson("/api/v1/attendance/regulars?date=2026-09-16&academy_class_id={$this->gi->id}")
        ->assertOk()
        ->assertJsonStructure(['data', 'meta' => ['occurrences', 'occurrence_dates']]);
});

it('needs a day and a class, well formed', function (string $query, string $field): void {
    $query = str_replace('{class}', (string) $this->gi->id, $query);

    $this->actingAs($this->user)
        ->getJson("/api/v1/attendance/regulars?{$query}")
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'no class' => ['date=2026-09-16', 'academy_class_id'],
    'class not a number' => ['date=2026-09-16&academy_class_id=gi', 'academy_class_id'],
    'no date' => ['academy_class_id={class}', 'date'],
    'malformed date' => ['date=16/09/2026&academy_class_id={class}', 'date'],
]);

it('refuses a class that is not this academy', function (): void {
    $foreign = AcademyClass::factory()->create(['weekday' => 3]);

    $this->actingAs($this->user)
        ->getJson("/api/v1/attendance/regulars?date=2026-09-16&academy_class_id={$foreign->id}")
        ->assertForbidden();

    $this->actingAs($this->user)
        ->getJson('/api/v1/attendance/regulars?date=2026-09-16&academy_class_id=999999')
        ->assertForbidden();
});

it('is read by whoever reads attendance', function (): void {
    $instructor = User::factory()->create(['active_academy_id' => $this->academy->id]);
    AcademyMembership::factory()->for($instructor)->for($this->academy)->create(['role' => 'instructor']);

    $this->actingAs($instructor)
        ->getJson("/api/v1/attendance/regulars?date=2026-09-16&academy_class_id={$this->gi->id}")
        ->assertOk();

    $this->actingAs(User::factory()->create())
        ->getJson("/api/v1/attendance/regulars?date=2026-09-16&academy_class_id={$this->gi->id}")
        ->assertForbidden();
});
