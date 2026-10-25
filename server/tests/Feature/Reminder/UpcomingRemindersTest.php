<?php

declare(strict_types=1);

use App\Enums\AppLocale;
use App\Enums\AthleteStatus;
use App\Enums\DocumentType;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Carnet;
use App\Models\Document;
use App\Models\User;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

/*
 * The reminders of the next fourteen days (#2047), for the phone to hand to
 * Android: nothing runs on a phone with the app closed, so the reminders the
 * PC sends on the day are scheduled ahead, with the PC's own sentences. What
 * each reminder selects is the PC's rule (`ReminderSubjects`), tested with
 * its commands; here, the days, the times, the keys and the words.
 */

beforeEach(function (): void {
    // A Monday, 10:00 in Rome: the operator's day (#1963) is 4 May, and the
    // window runs to the 17th.
    Carbon::setTestNow('2026-05-04 08:00:00');
});

afterEach(function (): void {
    Carbon::setTestNow();
});

/** An owner reading the app in Italian, with an academy that trains Mon/Wed/Fri and charges a fee. */
function remindersOwner(AppLocale $locale = AppLocale::It): User
{
    $owner = User::factory()->create(['locale' => $locale]);
    $academy = Academy::factory()->for($owner, 'owner')->create([
        'training_days' => [1, 3, 5],
        'monthly_fee_cents' => 6000,
    ]);
    $academy->schedules()->create(['training_days' => [1, 3, 5], 'effective_from' => '2026-01-01']);
    Sanctum::actingAs($owner);

    return $owner;
}

/** An active athlete, no birthday in the window, there since January. */
function remindersAthlete(User $owner, string $first, string $last, array $over = []): Athlete
{
    return Athlete::factory()->create([
        'academy_id' => $owner->activeAcademy()?->id,
        'first_name' => $first,
        'last_name' => $last,
        'status' => AthleteStatus::Active,
        'date_of_birth' => '1990-01-15',
        'joined_at' => '2026-01-01',
        ...$over,
    ]);
}

/** Paid for the window's month, so the 16th's digest leaves them out. */
function remindersPaidUp(Athlete $athlete): Athlete
{
    AthletePayment::factory()->create(['athlete_id' => $athlete->id, 'year' => 2026, 'month' => 5]);

    return $athlete;
}

/** Came on the last session before today, so the missed streak leaves them out. */
function remindersPresent(Athlete $athlete): Athlete
{
    AttendanceRecord::factory()->create(['athlete_id' => $athlete->id, 'attended_on' => '2026-05-01']);

    return $athlete;
}

/** @return list<array{key: string, at: string, title: string, body: string, link: string}> */
function upcomingReminders(): array
{
    /** @var list<array{key: string, at: string, title: string, body: string, link: string}> */
    return test()->getJson('/api/v1/reminders/upcoming')->assertOk()->json('data');
}

/** @return list<string> */
function upcomingKeys(): array
{
    return array_column(upcomingReminders(), 'key');
}

it('refuses a request with no session', function (): void {
    $this->getJson('/api/v1/reminders/upcoming')->assertUnauthorized();
});

it('refuses an athlete: the reminders are the owner\'s', function (): void {
    Sanctum::actingAs(User::factory()->athlete()->create());

    $this->getJson('/api/v1/reminders/upcoming')->assertForbidden();
});

it('reminds of a certificate a week before it expires and on the day, at nine in Rome', function (): void {
    $owner = remindersOwner();
    $anna = remindersPresent(remindersPaidUp(remindersAthlete($owner, 'Anna', 'Rossi')));
    Document::factory()->create([
        'athlete_id' => $anna->id,
        'type' => DocumentType::MedicalCertificate,
        'expires_at' => '2026-05-14',
    ]);

    // The month before fell on 14 April, before the window.
    expect(upcomingReminders())->toBe([
        [
            'key' => 'medical-certificates:2026-05-07',
            'at' => '2026-05-07T09:00:00+02:00',
            'title' => 'Un certificato medico sta per scadere',
            'body' => 'Anna Rossi',
            'link' => '/dashboard/documents/expiring',
        ],
        [
            'key' => 'medical-certificates:2026-05-14',
            'at' => '2026-05-14T09:00:00+02:00',
            'title' => 'Un certificato medico sta per scadere',
            'body' => 'Anna Rossi',
            'link' => '/dashboard/documents/expiring',
        ],
    ]);
});

it('looks fourteen days ahead, today included', function (): void {
    $academy = remindersOwner()->activeAcademy();
    assert($academy !== null);
    // The day itself falls on the 18th, one past the window; its week before is inside.
    Document::factory()->forAcademy($academy)->create([
        'type' => DocumentType::Other,
        'original_name' => 'Assicurazione',
        'expires_at' => '2026-05-18',
    ]);
    // Its week before is today, past nine: still listed, for the phone to catch up.
    Document::factory()->forAcademy($academy)->create([
        'type' => DocumentType::Other,
        'original_name' => 'Affitto',
        'expires_at' => '2026-05-11',
    ]);

    $reminders = upcomingReminders();

    expect(array_column($reminders, 'key'))->toBe([
        'academy-documents:2026-05-04',
        'academy-documents:2026-05-11',
    ])
        ->and($reminders[0]['at'])->toBe('2026-05-04T09:00:00+02:00')
        ->and($reminders[0]['body'])->toBe('Affitto, scade il 11 maggio 2026')
        ->and($reminders[1]['body'])->toBe("Affitto, scade il 11 maggio 2026\nAssicurazione, scade il 18 maggio 2026");
});

it('reminds on the 16th of the athletes who still owe the month', function (): void {
    $owner = remindersOwner();
    remindersPresent(remindersAthlete($owner, 'Marco', 'Bianchi'));
    remindersPresent(remindersPaidUp(remindersAthlete($owner, 'Luca', 'Verdi')));

    expect(upcomingReminders())->toBe([
        [
            'key' => 'unpaid:2026-05',
            'at' => '2026-05-16T09:00:00+02:00',
            'title' => 'Un atleta non ha ancora pagato la quota di maggio',
            'body' => 'Marco Bianchi',
            'link' => '/dashboard/athletes?paid=no',
        ],
    ]);
});

it('judges a carnet on the 16th: one that lapses before it pays for nothing that day', function (): void {
    $owner = remindersOwner();
    $lapsing = remindersPresent(remindersAthlete($owner, 'Marco', 'Bianchi'));
    Carnet::factory()->for($lapsing)->create([
        'purchased_at' => '2026-04-11',
        'valid_from' => '2026-04-11',
        'expires_at' => '2026-05-10',
    ]);
    $covered = remindersPresent(remindersAthlete($owner, 'Luca', 'Verdi'));
    Carnet::factory()->for($covered)->create([
        'purchased_at' => '2026-04-11',
        'valid_from' => '2026-04-11',
        'expires_at' => '2026-07-10',
    ]);

    $reminders = upcomingReminders();

    expect(array_column($reminders, 'key'))->toBe(['unpaid:2026-05'])
        ->and($reminders[0]['body'])->toBe('Marco Bianchi');
});

it('has no unpaid reminder once everyone has paid', function (): void {
    $owner = remindersOwner();
    remindersPresent(remindersPaidUp(remindersAthlete($owner, 'Marco', 'Bianchi')));

    expect(upcomingKeys())->toBe([]);
});

it('has no unpaid reminder when the 16th is not in the window', function (): void {
    Carbon::setTestNow('2026-05-20 08:00:00');
    $owner = remindersOwner();
    AttendanceRecord::factory()->create([
        'athlete_id' => remindersAthlete($owner, 'Marco', 'Bianchi')->id,
        'attended_on' => '2026-05-18',
    ]);

    expect(upcomingKeys())->toBe([]);
});

it('reminds of a birthday on its morning, the active athletes only', function (): void {
    $owner = remindersOwner();
    $born = ['date_of_birth' => '1990-05-06'];
    remindersPresent(remindersPaidUp(remindersAthlete($owner, 'Giulia', 'Verdi', $born)));
    remindersPresent(remindersPaidUp(remindersAthlete($owner, 'Sara', 'Neri', [...$born, 'status' => AthleteStatus::Inactive])));
    remindersPresent(remindersPaidUp(remindersAthlete($owner, 'Owner', 'Self', [...$born, 'is_self' => true])));

    expect(upcomingReminders())->toBe([
        [
            'key' => 'birthdays:2026-05-06',
            'at' => '2026-05-06T09:00:00+02:00',
            'title' => 'Un compleanno oggi',
            'body' => 'Giulia Verdi',
            'link' => '/dashboard/today',
        ],
    ]);
});

it('keeps a 29 February birthday on the 28th in a common year', function (): void {
    Carbon::setTestNow('2027-02-25 08:00:00');
    $owner = remindersOwner();
    $leap = remindersAthlete($owner, 'Elia', 'Gallo', ['date_of_birth' => '2000-02-29']);
    AthletePayment::factory()->create(['athlete_id' => $leap->id, 'year' => 2027, 'month' => 2]);
    AttendanceRecord::factory()->create(['athlete_id' => $leap->id, 'attended_on' => '2027-02-24']);

    expect(upcomingKeys())->toBe(['birthdays:2027-02-28']);
});

it('reminds this morning of an athlete who missed the last three sessions, keyed by their last one', function (): void {
    $owner = remindersOwner();
    $mario = remindersPaidUp(remindersAthlete($owner, 'Mario', 'Neri'));
    AttendanceRecord::factory()->create(['athlete_id' => $mario->id, 'attended_on' => '2026-04-24']);
    // Never came: the absence runs from the day they joined.
    $nadia = remindersPaidUp(remindersAthlete($owner, 'Nadia', 'Conti'));

    $reminders = upcomingReminders();

    expect(array_column($reminders, 'key'))->toBe([
        "missed-streak:{$mario->id}:2026-04-24",
        "missed-streak:{$nadia->id}:2026-01-01",
    ])
        ->and($reminders[0])->toMatchArray([
            'at' => '2026-05-04T09:30:00+02:00',
            'title' => "Mario Neri non si allena da un po'",
            'body' => 'Ha saltato gli ultimi 3 allenamenti in programma.',
            'link' => "/dashboard/athletes/{$mario->id}",
        ]);
});

it('keeps the absence\'s key when the athlete checks in today', function (): void {
    $owner = remindersOwner();
    $mario = remindersPaidUp(remindersAthlete($owner, 'Mario', 'Neri'));
    AttendanceRecord::factory()->create(['athlete_id' => $mario->id, 'attended_on' => '2026-04-24']);
    $before = upcomingKeys();

    // Tonight's session: the streak reads the sessions before today, so it
    // still holds, and must not come back as another absence.
    AttendanceRecord::factory()->create(['athlete_id' => $mario->id, 'attended_on' => '2026-05-04']);

    expect(upcomingKeys())->toBe($before)
        ->and($before)->toBe(["missed-streak:{$mario->id}:2026-04-24"]);
});

it('keeps the absence\'s key across a check-in on a day with no session', function (): void {
    Carbon::setTestNow('2026-05-03 08:00:00');
    $owner = remindersOwner();
    $mario = remindersPaidUp(remindersAthlete($owner, 'Mario', 'Neri'));
    AttendanceRecord::factory()->create(['athlete_id' => $mario->id, 'attended_on' => '2026-04-24']);
    // Saturday's open mat: the academy trains Mon/Wed/Fri, so the streak,
    // read on scheduled days, still holds on Sunday.
    AttendanceRecord::factory()->create(['athlete_id' => $mario->id, 'attended_on' => '2026-05-02']);

    expect(upcomingKeys())->toBe(["missed-streak:{$mario->id}:2026-04-24"]);
});

it('leaves out what the owner turned off', function (): void {
    $owner = remindersOwner();
    $owner->update(['notification_preferences' => ['unpaid_athletes_digest' => false]]);
    remindersPresent(remindersAthlete($owner, 'Marco', 'Bianchi', ['date_of_birth' => '1990-05-06']));

    expect(upcomingKeys())->toBe(['birthdays:2026-05-06']);
});

it('writes in the owner\'s language', function (): void {
    $owner = remindersOwner(AppLocale::En);
    remindersPresent(remindersAthlete($owner, 'Marco', 'Bianchi'));

    expect(upcomingReminders()[0]['title'])->toBe("1 athlete hasn't paid May's fee yet");
});

it('reads only the owner\'s own academy', function (): void {
    $other = User::factory()->create();
    $elsewhere = Academy::factory()->for($other, 'owner')->create();
    Athlete::factory()->create([
        'academy_id' => $elsewhere->id,
        'status' => AthleteStatus::Active,
        'date_of_birth' => '1990-05-06',
    ]);
    remindersOwner();

    expect(upcomingKeys())->toBe([]);
});
