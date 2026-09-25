<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The phone pair stores the national SIGNIFICANT number (#1867).
 *
 * `phone_country_code` + `phone_national_number` is meant to be E.164-shaped:
 * the dial code, then the number as dialled from abroad. That is what the
 * `tel:` and `wa.me` links (#1727) assume. Two paths broke it:
 *
 * - the form stored the national part exactly as typed, so `+44` with
 *   `07911123456` kept its trunk zero and `wa.me/4407911123456` did not open;
 * - the CSV import used libphonenumber's national number, which drops an
 *   Italian landline's leading zero, so `06 1234567` was stored as
 *   `61234567` and dialled a different line.
 *
 * The national significant number drops a trunk zero and keeps an Italian
 * leading zero. Every write stores it. A one-off migration drops the trunk
 * zeros already on disk; it does NOT put an Italian zero back, because a zero
 * guessed onto an import's unchecked value can make a stranger's landline. It
 * names those rows in the log for a person to check instead.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
});

function athleteWithPhone(mixed $test, string $countryCode, string $nationalNumber): \Illuminate\Testing\TestResponse
{
    return $test->actingAs($test->user)->postJson('/api/v1/athletes', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'phone_country_code' => $countryCode,
        'phone_national_number' => $nationalNumber,
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
    ]);
}

// ─── The form ────────────────────────────────────────────────────────────────

it('drops a trunk zero typed on the form', function (): void {
    athleteWithPhone($this, '+44', '07911123456')
        ->assertCreated()
        ->assertJsonPath('data.phone_national_number', '7911123456');

    expect(Athlete::query()->sole()->phone_national_number)->toBe('7911123456');
});

it('keeps the leading zero of an Italian landline typed on the form', function (): void {
    athleteWithPhone($this, '+39', '061234567')
        ->assertCreated()
        ->assertJsonPath('data.phone_national_number', '061234567');
});

it('leaves an Italian mobile as it was typed', function (): void {
    athleteWithPhone($this, '+39', '3331234567')
        ->assertCreated()
        ->assertJsonPath('data.phone_national_number', '3331234567');
});

it('still refuses an invalid number, and says so about what was typed', function (): void {
    athleteWithPhone($this, '+39', '1')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_national_number']);
});

it('normalises on an athlete update too', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create([
        'phone_country_code' => null,
        'phone_national_number' => null,
    ]);

    $this->actingAs($this->user)
        ->putJson("/api/v1/athletes/{$athlete->id}", [
            'phone_country_code' => '+44',
            'phone_national_number' => '07911123456',
        ])
        ->assertOk()
        ->assertJsonPath('data.phone_national_number', '7911123456');
});

it("normalises the academy's own phone", function (): void {
    $this->actingAs($this->user)
        ->patchJson('/api/v1/academy', [
            'phone_country_code' => '+44',
            'phone_national_number' => '07911123456',
        ])
        ->assertOk()
        ->assertJsonPath('data.phone_national_number', '7911123456');
});

// ─── The import ──────────────────────────────────────────────────────────────

it('imports an Italian landline with its leading zero', function (): void {
    $this->academy->update(['phone_country_code' => '+39', 'phone_national_number' => '0551234567']);
    $file = UploadedFile::fake()->createWithContent(
        'atleti.csv',
        "Nome;Cognome;Cintura;Telefono;Data iscrizione\nMarco;Rossi;bianca;06 1234567;01/09/2024\n",
    );

    $this->actingAs($this->user)
        ->post('/api/v1/athletes/import', ['file' => $file, 'validate_only' => false])
        ->assertOk();

    expect(Athlete::query()->sole()->phone_national_number)->toBe('061234567');
});

// ─── The rows already on disk ────────────────────────────────────────────────

function phoneMigration(): object
{
    return require database_path('migrations/2026_09_25_100000_normalise_phone_national_numbers.php');
}

/** A row written the way the old paths wrote it, past every rule of today. */
function athletePhoneOnDisk(mixed $test, ?string $countryCode, ?string $nationalNumber): Athlete
{
    $athlete = Athlete::factory()->for($test->academy)->create();
    DB::table('athletes')->where('id', $athlete->id)->update([
        'phone_country_code' => $countryCode,
        'phone_national_number' => $nationalNumber,
    ]);

    return $athlete;
}

it('does not guess a leading zero back onto an Italian number it cannot read', function (string $stored): void {
    // `0` + 6 to 11 digits is a plausible Italian landline to libphonenumber,
    // so `61234567` with a zero is valid — and so is the import's unchecked
    // junk. A guessed number that rings a stranger is worse than an invalid
    // one the owner will notice.
    $athlete = athletePhoneOnDisk($this, '+39', $stored);

    phoneMigration()->up();

    expect($athlete->refresh()->phone_national_number)->toBe($stored);
})->with(['61234567', '123456', '1234567', '5512345']);

it('drops a trunk zero already on disk', function (): void {
    $athlete = athletePhoneOnDisk($this, '+44', '07911123456');

    phoneMigration()->up();

    expect($athlete->refresh()->phone_national_number)->toBe('7911123456');
});

it('leaves an already-normal number, an empty pair and an unreadable one alone', function (): void {
    $mobile = athletePhoneOnDisk($this, '+39', '3331234567');
    $landline = athletePhoneOnDisk($this, '+39', '061234567');
    $none = athletePhoneOnDisk($this, null, null);
    // Invalid either way: nothing here says what it should have been, so it
    // is left for a person to correct rather than rewritten on a guess.
    $junk = athletePhoneOnDisk($this, '+39', '1');

    phoneMigration()->up();

    expect($mobile->refresh()->phone_national_number)->toBe('3331234567')
        ->and($landline->refresh()->phone_national_number)->toBe('061234567')
        ->and($none->refresh()->phone_national_number)->toBeNull()
        ->and($junk->refresh()->phone_national_number)->toBe('1');
});

it("puts an academy's own phone right too, and a deleted athlete's", function (): void {
    DB::table('academies')->where('id', $this->academy->id)->update([
        'phone_country_code' => '+44',
        'phone_national_number' => '07911123456',
    ]);
    $gone = athletePhoneOnDisk($this, '+33', '0612345678');
    $gone->delete();

    phoneMigration()->up();

    expect(Academy::query()->find($this->academy->id)?->phone_national_number)->toBe('7911123456')
        ->and(Athlete::withTrashed()->find($gone->id)?->phone_national_number)->toBe('612345678');
});

it('says what it changed in the log, without writing the numbers out', function (): void {
    Log::spy();
    $athlete = athletePhoneOnDisk($this, '+44', '07911123456');
    athletePhoneOnDisk($this, '+39', '3331234567');

    phoneMigration()->up();

    // One line per row it changed and a closing count, nothing for a row it
    // left alone. A phone number is personal data (PiiRedactor): the log
    // names the row and the fix, and keeps only the last three digits.
    Log::shouldHaveReceived('info')
        ->withArgs(static fn (string $message, array $context): bool => str_contains($message, 'phone')
            && ($context['table'] ?? null) === 'athletes'
            && ($context['id'] ?? null) === $athlete->id
            && ($context['fix'] ?? null) === 'dropped a trunk zero'
            && ($context['ends_with'] ?? null) === '456'
            && ! str_contains(json_encode($context, JSON_THROW_ON_ERROR), '7911123456'))
        ->once();
    Log::shouldHaveReceived('info')
        ->withArgs(static fn (string $message, array $context): bool => ($context['changed'] ?? null) === 1)
        ->once();
    Log::shouldHaveReceived('info')->twice();
    Log::shouldNotHaveReceived('warning');
});

it('names the Italian numbers still invalid for a person to check, without the numbers', function (): void {
    Log::spy();
    // A landline the import stored without its zero, before this fix.
    $dropped = athletePhoneOnDisk($this, '+39', '61234567');
    athletePhoneOnDisk($this, '+39', '3331234567');
    // Only Italian numbers: this is the import's dial code, and another
    // country's invalid number is not a zero it dropped.
    athletePhoneOnDisk($this, '+44', '1');
    DB::table('academies')->where('id', $this->academy->id)->update([
        'phone_country_code' => '+39',
        'phone_national_number' => '5512345',
    ]);
    $academyId = $this->academy->id;

    phoneMigration()->up();

    Log::shouldHaveReceived('warning')
        ->withArgs(static fn (string $message, array $context): bool => str_contains($message, 'phone')
            && ($context['count'] ?? null) === 2
            && ($context['rows'] ?? null) === [
                ['table' => 'athletes', 'id' => $dropped->id, 'ends_with' => '567'],
                ['table' => 'academies', 'id' => $academyId, 'ends_with' => '345'],
            ]
            && ! str_contains(json_encode($context, JSON_THROW_ON_ERROR), '61234567'))
        ->once();
});

it('masks a value too short to show only its end', function (): void {
    Log::spy();
    $short = athletePhoneOnDisk($this, '+39', '12');

    phoneMigration()->up();

    Log::shouldHaveReceived('warning')
        ->withArgs(static fn (string $message, array $context): bool => str_contains($message, 'phone')
            && ($context['rows'] ?? null) === [
                ['table' => 'athletes', 'id' => $short->id, 'ends_with' => '***'],
            ])
        ->once();
});

it('changes nothing the second time', function (): void {
    $athlete = athletePhoneOnDisk($this, '+44', '07911123456');

    phoneMigration()->up();
    phoneMigration()->up();

    expect($athlete->refresh()->phone_national_number)->toBe('7911123456');
});
