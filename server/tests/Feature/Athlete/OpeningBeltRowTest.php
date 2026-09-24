<?php

declare(strict_types=1);

use App\Actions\Engagement\EvaluateAchievementsAction;
use App\Enums\AchievementKind;
use App\Enums\Belt;
use App\Models\Achievement;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\User;
use Illuminate\Http\UploadedFile;

// helpers live in tests/Pest.php

/**
 * The opening belt row (#1771).
 *
 * An athlete's timeline used to start empty: a blue belt of nine years,
 * imported from a CSV, read "No promotions yet", and anything measured from
 * the log started from a gap. Creating an athlete now writes one row — the
 * belt they hold as their Budojo record begins, dated the day it begins.
 *
 * Dated then, and not at `joined_at`: an import carries today's belt and the
 * joining date of years ago, and "arrived at blue in 2019" is false for
 * everyone who arrived white and was promoted since. The belt held the day
 * the record starts is the one fact the app actually has.
 */
beforeEach(function (): void {
    $this->travelTo('2026-09-24 10:00:00');
    $this->owner = userWithAcademy();
    $this->academy = $this->owner->academy;
});

/** @return list<array<string, mixed>> */
function timelineOf(object $test, Athlete $athlete): array
{
    /** @var list<array<string, mixed>> */
    return $test->actingAs($test->owner)
        ->getJson("/api/v1/athletes/{$athlete->id}/promotions")
        ->assertOk()
        ->json('data');
}

// ─── Written on every path that creates an athlete ───────────────────────────

it('writes the opening belt row when an athlete is created', function (): void {
    $id = $this->actingAs($this->owner)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Marco',
            'last_name' => 'Rossi',
            'belt' => 'blue',
            'stripes' => 2,
            'status' => 'active',
            'joined_at' => '2019-09-01',
        ])
        ->assertCreated()
        ->json('data.id');

    $rows = timelineOf($this, Athlete::findOrFail($id));

    // One row, not two: a stripe row asserts a change (0 → 2) that never
    // happened on this date. The belt row's date plus the athlete's current
    // stripes already anchor "since the record began".
    expect($rows)->toHaveCount(1)
        ->and($rows[0]['kind'])->toBe('belt')
        ->and($rows[0]['from_belt'])->toBeNull()
        ->and($rows[0]['to_belt'])->toBe('blue')
        ->and(substr($rows[0]['recorded_at'], 0, 10))->toBe('2026-09-24');
    expect(AthletePromotion::query()->where('athlete_id', $id)->value('recorded_by_user_id'))
        ->toBe($this->owner->id);
});

it('writes one opening row per imported athlete, each at their own belt', function (): void {
    $lines = [
        'Nome;Cognome;Cintura;Gradi;Data di nascita;Telefono;Data iscrizione',
        'Marco;Rossi;blu;2;15/03/1990;;01/09/2019',
        'Luca;Bianchi;viola;0;02/02/1988;;01/09/2016',
        'Sara;Verdi;bianca;1;10/10/2000;;01/09/2026',
    ];
    $file = UploadedFile::fake()->createWithContent('atleti.csv', implode("\n", $lines) . "\n");

    $this->actingAs($this->owner)
        ->post('/api/v1/athletes/import', ['file' => $file, 'validate_only' => false])
        ->assertOk()
        ->assertJsonPath('data.imported', 3);

    $rows = AthletePromotion::query()->with('athlete')->get();

    expect($rows)->toHaveCount(3)
        ->and($rows->every(fn (AthletePromotion $p): bool => $p->kind === 'belt'
            && $p->from_belt === null
            && $p->to_belt === $p->athlete->belt
            && $p->recorded_at->toDateString() === '2026-09-24'
            && $p->recorded_by_user_id === $this->owner->id))->toBeTrue();
});

it('writes nothing on the import dry run', function (): void {
    $file = UploadedFile::fake()->createWithContent('atleti.csv', "Nome;Cognome;Cintura\nMarco;Rossi;blu\n");

    $this->actingAs($this->owner)
        ->post('/api/v1/athletes/import', ['file' => $file])
        ->assertOk();

    expect(AthletePromotion::query()->count())->toBe(0);
});

it('writes the opening row when the owner enrols as an athlete', function (): void {
    $this->actingAs($this->owner)->postJson('/api/v1/me/athlete')->assertSuccessful();

    $self = Athlete::query()->where('is_self', true)->firstOrFail();
    $rows = timelineOf($this, $self);

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['from_belt'])->toBeNull()
        ->and($rows[0]['to_belt'])->toBe($self->belt->value);
});

// ─── An arrival is not a promotion ───────────────────────────────────────────

it('does not unlock the belt promotion achievement on arrival, only on a real promotion', function (): void {
    $id = $this->actingAs($this->owner)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Marco', 'last_name' => 'Rossi', 'belt' => 'blue', 'stripes' => 0,
            'status' => 'active', 'joined_at' => '2019-09-01',
        ])
        ->json('data.id');
    $athlete = Athlete::findOrFail($id);
    $athlete->update(['user_id' => User::factory()->athlete()->create()->id]);
    $unlocked = fn (): bool => Achievement::query()
        ->where('athlete_id', $athlete->id)
        ->where('kind', AchievementKind::BeltPromotion->value)
        ->exists();

    app(EvaluateAchievementsAction::class)->execute($athlete->fresh());
    // `UNIQUE (athlete_id, kind)` would also make this the ONLY unlock the
    // athlete could ever have — their real first promotion would never count.
    expect($unlocked())->toBeFalse();

    $this->actingAs($this->owner)
        ->putJson("/api/v1/athletes/{$athlete->id}", ['belt' => 'purple', 'stripes' => 0])
        ->assertOk();
    app(EvaluateAchievementsAction::class)->execute($athlete->fresh());

    expect($unlocked())->toBeTrue();
});

it('keeps the arrival out of the public promotions timeline', function (): void {
    $user = User::factory()->athlete()->create(['handle' => 'marcobjj', 'profile_is_public' => true]);
    $id = $this->actingAs($this->owner)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Marco', 'last_name' => 'Rossi', 'belt' => 'blue', 'stripes' => 0,
            'status' => 'active', 'joined_at' => '2019-09-01',
        ])
        ->json('data.id');
    Athlete::findOrFail($id)->update(['user_id' => $user->id]);

    // The public line reads "Promoted from X to Y". An arrival has no X, and
    // defaulting it to white told peers a blue belt was promoted today.
    $this->actingAs($this->owner)
        ->getJson('/api/v1/users/marcobjj/profile')
        ->assertOk()
        ->assertJsonCount(0, 'data.promotions');
});

// ─── Transcribing the history before the record began ────────────────────────

function startedAt(object $test, Belt $belt): Athlete
{
    $athlete = Athlete::factory()->for($test->academy)->create(['belt' => $belt]);
    AthletePromotion::create([
        'athlete_id' => $athlete->id, 'kind' => 'belt', 'from_belt' => null, 'to_belt' => $belt->value,
        'belt_at_event' => $belt->value, 'recorded_at' => '2026-09-24 09:00:00', 'recorded_by_user_id' => $test->owner->id,
    ]);

    return $athlete;
}

function backfill(object $test, Athlete $athlete, string $from, string $to, string $on): \Illuminate\Testing\TestResponse
{
    return $test->actingAs($test->owner)->postJson("/api/v1/athletes/{$athlete->id}/promotions", [
        'kind' => 'belt', 'from_belt' => $from, 'to_belt' => $to, 'recorded_at' => $on,
    ]);
}

it('takes a paper register oldest-first, before the starting row', function (): void {
    // Imported at purple. The register says white → blue in 2019 and blue →
    // purple in 2021, and the owner types it in the order it is written. A
    // starting row says only "held purple that day", so the first line —
    // which ends at blue — is not a contradiction of it.
    $athlete = startedAt($this, Belt::Purple);

    backfill($this, $athlete, 'white', 'blue', '2019-05-10')->assertCreated();
    backfill($this, $athlete, 'blue', 'purple', '2021-06-12')->assertCreated();
});

it('takes an incomplete register that never reaches the starting belt', function (): void {
    // Blue in 2019 is written down; the promotion to purple never was.
    $athlete = startedAt($this, Belt::Purple);

    backfill($this, $athlete, 'white', 'blue', '2019-05-10')->assertCreated();
});

it('still refuses a backfill that contradicts the promotion before it', function (): void {
    $athlete = startedAt($this, Belt::Purple);
    backfill($this, $athlete, 'white', 'blue', '2019-05-10')->assertCreated();

    // The row before 2020 ends at blue, so 2020 cannot start at purple.
    backfill($this, $athlete, 'purple', 'brown', '2020-01-10')
        ->assertUnprocessable()
        ->assertJsonValidationErrors('from_belt');
});

// ─── Existing rosters ────────────────────────────────────────────────────────

function openingRowsMigration(): object
{
    return require database_path('migrations/2026_09_24_110000_write_opening_belt_rows.php');
}

it('backfills an opening row for an athlete with no history, at the day their record began', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create(['belt' => Belt::Purple, 'joined_at' => '2016-09-01']);
    $athlete->forceFill(['created_at' => '2026-03-02 18:30:00'])->saveQuietly();

    openingRowsMigration()->up();

    $row = AthletePromotion::query()->where('athlete_id', $athlete->id)->sole();
    expect($row->from_belt)->toBeNull()
        ->and($row->to_belt)->toBe(Belt::Purple)
        ->and($row->belt_at_event)->toBe(Belt::Purple)
        ->and($row->recorded_at->toDateTimeString())->toBe('2026-03-02 18:30:00')
        ->and($row->recorded_by_user_id)->toBe($this->owner->id);
});

it('opens at the belt they held when the record began, not the one they hold now', function (): void {
    // Created at white in March, promoted to blue in June: the arrival is
    // white. Writing today's belt would put "arrived at blue" directly under
    // the white → blue row.
    $athlete = Athlete::factory()->for($this->academy)->create(['belt' => Belt::Blue]);
    $athlete->forceFill(['created_at' => '2026-03-02 18:30:00'])->saveQuietly();
    AthletePromotion::create([
        'athlete_id' => $athlete->id, 'kind' => 'belt', 'from_belt' => 'white', 'to_belt' => 'blue',
        'belt_at_event' => 'blue', 'recorded_at' => '2026-06-10 19:00:00', 'recorded_by_user_id' => $this->owner->id,
    ]);

    openingRowsMigration()->up();

    $opening = AthletePromotion::query()->where('athlete_id', $athlete->id)->whereNull('from_belt')->sole();
    expect($opening->to_belt)->toBe(Belt::White);
});

it('leaves an athlete alone whose history already covers the day the record began', function (): void {
    $transcribed = Athlete::factory()->for($this->academy)->create(['belt' => Belt::Blue]);
    $transcribed->forceFill(['created_at' => '2026-03-02 18:30:00'])->saveQuietly();
    AthletePromotion::create([
        'athlete_id' => $transcribed->id, 'kind' => 'belt', 'from_belt' => 'white', 'to_belt' => 'blue',
        'belt_at_event' => 'blue', 'recorded_at' => '2021-05-10 00:00:00', 'recorded_by_user_id' => $this->owner->id,
    ]);
    $opened = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);
    // Record began in March, starting row written in September: only the
    // "already opens" check can skip this one, not the date check.
    $opened->forceFill(['created_at' => '2026-03-02 18:30:00'])->saveQuietly();
    AthletePromotion::create([
        'athlete_id' => $opened->id, 'kind' => 'belt', 'from_belt' => null, 'to_belt' => 'white',
        'belt_at_event' => 'white', 'recorded_at' => '2026-09-01 00:00:00', 'recorded_by_user_id' => $this->owner->id,
    ]);

    openingRowsMigration()->up();
    openingRowsMigration()->up();

    // Already anchored by the transcribed row, already opened by the owner —
    // and running twice writes nothing twice.
    expect(AthletePromotion::query()->where('athlete_id', $transcribed->id)->count())->toBe(1)
        ->and(AthletePromotion::query()->where('athlete_id', $opened->id)->count())->toBe(1);
});
