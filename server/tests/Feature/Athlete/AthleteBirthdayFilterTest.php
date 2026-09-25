<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Models\Athlete;
use App\Models\User;

// helpers live in tests/Pest.php

// `?birthday=today|week` on the roster (#1754) — who to send a message to,
// asked of the server because the roster is paginated. The week is seven
// literal month-days, never a range: a range cannot cross the new year, and
// 29 February only exists in a real year.

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
});

function birthdayAthleteBornOn(object $test, ?string $dateOfBirth, AthleteStatus $status = AthleteStatus::Active): Athlete
{
    return Athlete::factory()->for($test->academy)->create([
        'date_of_birth' => $dateOfBirth,
        'status' => $status,
    ]);
}

/** @return list<int> */
function birthdayIds(object $test, string $query): array
{
    /** @var User $user */
    $user = $test->user;

    /** @var list<int> */
    return $test->actingAs($user)
        ->getJson("/api/v1/athletes?{$query}")
        ->assertOk()
        ->json('data.*.id');
}

it('finds the athlete whose birthday is today, and not the next day', function (): void {
    $athlete = birthdayAthleteBornOn($this, '1990-03-14');

    $this->travelTo('2026-03-14 10:00');
    expect(birthdayIds($this, 'birthday=today'))->toBe([$athlete->id]);

    $this->travelTo('2026-03-15 10:00');
    expect(birthdayIds($this, 'birthday=today'))->toBe([]);
});

it('never matches an athlete without a date of birth', function (): void {
    birthdayAthleteBornOn($this, null);
    $this->travelTo('2026-03-14 10:00');

    expect(birthdayIds($this, 'birthday=today'))->toBe([])
        ->and(birthdayIds($this, 'birthday=week'))->toBe([]);
});

it('takes the week across the new year', function (): void {
    $january = birthdayAthleteBornOn($this, '1995-01-02');
    birthdayAthleteBornOn($this, '1995-01-05');
    $this->travelTo('2026-12-29 10:00');

    expect(birthdayIds($this, 'birthday=week'))->toBe([$january->id]);
});

it('covers today and the six days after it, no more', function (): void {
    $today = birthdayAthleteBornOn($this, '2001-06-10');
    $sixth = birthdayAthleteBornOn($this, '2001-06-16');
    birthdayAthleteBornOn($this, '2001-06-09');
    birthdayAthleteBornOn($this, '2001-06-17');
    $this->travelTo('2026-06-10 10:00');

    expect(birthdayIds($this, 'birthday=week'))->toEqualCanonicalizing([$today->id, $sixth->id]);
});

it('finds a 29 February birthday in the week of a leap year', function (): void {
    $leapling = birthdayAthleteBornOn($this, '2000-02-29');
    birthdayAthleteBornOn($this, '2000-03-04');
    $this->travelTo('2028-02-26 10:00');

    expect(birthdayIds($this, 'birthday=week'))->toBe([$leapling->id]);
});

it('keeps a 29 February birthday on the 29th in a leap year, not the 28th', function (): void {
    $leapling = birthdayAthleteBornOn($this, '2000-02-29');

    $this->travelTo('2028-02-28 10:00');
    expect(birthdayIds($this, 'birthday=today'))->toBe([]);

    $this->travelTo('2028-02-29 10:00');
    expect(birthdayIds($this, 'birthday=today'))->toBe([$leapling->id]);
});

it('marks a 29 February birthday on 28 February in a year without one', function (): void {
    // Otherwise it would be missed three years in four.
    $leapling = birthdayAthleteBornOn($this, '2000-02-29');
    $twentyEighth = birthdayAthleteBornOn($this, '1999-02-28');
    birthdayAthleteBornOn($this, '1999-03-01');

    $this->travelTo('2027-02-28 10:00');
    expect(birthdayIds($this, 'birthday=today'))->toEqualCanonicalizing([$leapling->id, $twentyEighth->id]);

    $this->travelTo('2027-03-01 10:00');
    expect(birthdayIds($this, 'birthday=today'))->not->toContain($leapling->id);

    $this->travelTo('2027-02-22 10:00');
    expect(birthdayIds($this, 'birthday=week'))->toEqualCanonicalizing([$leapling->id, $twentyEighth->id]);
});

it('ignores a value it does not know, as it does for paid', function (): void {
    $athlete = birthdayAthleteBornOn($this, '1990-03-14');
    $other = birthdayAthleteBornOn($this, '1990-07-01');
    $this->travelTo('2026-03-14 10:00');

    expect(birthdayIds($this, 'birthday=nonsense'))->toEqualCanonicalizing([$athlete->id, $other->id]);
});

it('says nothing about status on its own; the caller asks for it', function (): void {
    $active = birthdayAthleteBornOn($this, '1990-03-14');
    $inactive = birthdayAthleteBornOn($this, '1988-03-14', AthleteStatus::Inactive);
    birthdayAthleteBornOn($this, '1988-03-15');
    $this->travelTo('2026-03-14 10:00');

    expect(birthdayIds($this, 'birthday=today&status=active'))->toBe([$active->id])
        ->and(birthdayIds($this, 'birthday=today'))->toEqualCanonicalizing([$active->id, $inactive->id]);
});

it('keeps to the academy the reader is in', function (): void {
    $mine = birthdayAthleteBornOn($this, '1990-03-14');
    birthdayAthleteBornOn($this, '1990-04-14');
    $elsewhere = userWithAcademy();
    Athlete::factory()->for($elsewhere->academy)->create(['date_of_birth' => '1990-03-14']);
    $this->travelTo('2026-03-14 10:00');

    expect(birthdayIds($this, 'birthday=today'))->toBe([$mine->id]);
});
