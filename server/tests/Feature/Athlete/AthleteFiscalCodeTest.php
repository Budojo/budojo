<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AuditEntry;
use Illuminate\Http\UploadedFile;

/**
 * The details a federation card asks for (#1934): the codice fiscale, the sex
 * as it appears on the document, and the place of birth.
 *
 * Every code is synthetic, built from the published algorithm (DM 23/12/1976):
 * RSSMRA90C15H501O is a man born 15/03/1990 in Rome, BNCGLI15H52F205N a girl
 * born 12/06/2015 in Milan, SMTJHN85A01Z404P a man born abroad.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
});

/** @param array<string, mixed> $extra */
function storeWithFiscalCode(mixed $test, array $extra = []): \Illuminate\Testing\TestResponse
{
    return $test->actingAs($test->user)->postJson('/api/v1/athletes', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
        ...$extra,
    ]);
}

// ─── Stored and returned ─────────────────────────────────────────────────────

it('stores the three details and returns them', function (): void {
    $id = storeWithFiscalCode($this, [
        'fiscal_code' => 'RSSMRA90C15H501O',
        'sex' => 'm',
        'birth_place' => 'Roma',
        'date_of_birth' => '1990-03-15',
    ])->assertCreated()->json('data.id');

    $this->actingAs($this->user)->getJson("/api/v1/athletes/{$id}")
        ->assertOk()
        ->assertJsonPath('data.fiscal_code', 'RSSMRA90C15H501O')
        ->assertJsonPath('data.sex', 'm')
        ->assertJsonPath('data.birth_place', 'Roma');
});

it('keeps every detail optional', function (): void {
    storeWithFiscalCode($this)
        ->assertCreated()
        ->assertJsonPath('data.fiscal_code', null)
        ->assertJsonPath('data.sex', null)
        ->assertJsonPath('data.birth_place', null);
});

it('stores the code in capitals without spaces, however it was typed', function (): void {
    storeWithFiscalCode($this, ['fiscal_code' => ' rssmra 90c15 h501o '])
        ->assertCreated()
        ->assertJsonPath('data.fiscal_code', 'RSSMRA90C15H501O');
});

it('accepts an athlete born abroad, and a country as the place of birth', function (): void {
    storeWithFiscalCode($this, ['fiscal_code' => 'SMTJHN85A01Z404P', 'birth_place' => 'Stati Uniti'])
        ->assertCreated()
        ->assertJsonPath('data.birth_place', 'Stati Uniti');
});

it('accepts an omocodic code', function (): void {
    storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H50MG'])->assertCreated();
});

it('sets the three details on an edit, and clears them', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create(['date_of_birth' => null]);

    $this->actingAs($this->user)->putJson("/api/v1/athletes/{$athlete->id}", [
        'fiscal_code' => 'BNCGLI15H52F205N',
        'sex' => 'f',
        'birth_place' => 'Milano',
    ])->assertOk()->assertJsonPath('data.sex', 'f');

    $this->actingAs($this->user)->putJson("/api/v1/athletes/{$athlete->id}", [
        'fiscal_code' => null,
        'sex' => null,
        'birth_place' => null,
    ])->assertOk()->assertJsonPath('data.fiscal_code', null);
});

// ─── Refused ─────────────────────────────────────────────────────────────────

it('refuses a code whose check character does not match', function (): void {
    storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H501A'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['fiscal_code']);
});

it('refuses a sex that is not m or f', function (): void {
    storeWithFiscalCode($this, ['sex' => 'x'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['sex']);
});

it('refuses a code that disagrees with the date of birth, and says so', function (): void {
    $message = storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H501O', 'date_of_birth' => '1990-03-16'])
        ->assertUnprocessable()
        ->json('errors.fiscal_code.0');

    expect($message)->toContain('15/03/1990');
});

it('refuses a code that disagrees with the sex, and says so', function (): void {
    $message = storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H501O', 'sex' => 'f'])
        ->assertUnprocessable()
        ->json('errors.fiscal_code.0');

    expect($message)->toContain('M, not F');
});

it('checks a code sent on its own against the date of birth already stored', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create(['date_of_birth' => '1991-01-01']);

    $this->actingAs($this->user)->putJson("/api/v1/athletes/{$athlete->id}", ['fiscal_code' => 'RSSMRA90C15H501O'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['fiscal_code']);
});

// ─── One code, one live athlete per academy ─────────────────────────────────

it('refuses a code another live athlete of the academy already has', function (): void {
    Athlete::factory()->for($this->academy)->create(['fiscal_code' => 'RSSMRA90C15H501O']);

    storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H501O'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['fiscal_code']);
});

it('lets a trashed athlete\'s code, or another academy\'s, be used again', function (): void {
    Athlete::factory()->for($this->academy)->create(['fiscal_code' => 'RSSMRA90C15H501O'])->delete();
    Athlete::factory()->for(Academy::factory())->create(['fiscal_code' => 'BNCGLI15H52F205N']);

    storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H501O'])->assertCreated();
    storeWithFiscalCode($this, ['fiscal_code' => 'BNCGLI15H52F205N', 'first_name' => 'Giulia'])->assertCreated();
});

it('lets an athlete keep their own code on an edit', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create([
        'fiscal_code' => 'RSSMRA90C15H501O',
        'date_of_birth' => '1990-03-15',
    ]);

    $this->actingAs($this->user)->putJson("/api/v1/athletes/{$athlete->id}", [
        'fiscal_code' => 'RSSMRA90C15H501O',
        'first_name' => 'Mario',
    ])->assertOk();
});

it('refuses to restore an athlete whose code a live athlete has taken since', function (): void {
    // Deleted, re-created by hand, then the old row restored: two live rows
    // with one code, and neither could be saved again — the form always sends
    // the code, and each would fail the unique rule against the other.
    $old = Athlete::factory()->for($this->academy)->create(['fiscal_code' => 'RSSMRA90C15H501O']);
    $old->delete();
    $holder = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'fiscal_code' => 'RSSMRA90C15H501O',
    ]);

    $this->actingAs($this->user)->postJson("/api/v1/athletes/{$old->id}/restore")
        ->assertUnprocessable()
        ->assertJsonPath('errors.fiscal_code.0', 'fiscal_code_taken')
        ->assertJsonPath('holder.id', $holder->id)
        ->assertJsonPath('holder.first_name', 'Mario')
        ->assertJsonPath('holder.last_name', 'Rossi')
        ->assertJsonPath('message', 'Mario Rossi, on the roster, already has this codice fiscale.');

    expect($old->fresh()?->trashed())->toBeTrue();
});

it('restores an athlete whose code only a trashed athlete or another academy holds', function (): void {
    $old = Athlete::factory()->for($this->academy)->create(['fiscal_code' => 'RSSMRA90C15H501O']);
    $old->delete();
    Athlete::factory()->for($this->academy)->create(['fiscal_code' => 'RSSMRA90C15H501O'])->delete();
    Athlete::factory()->for(Academy::factory())->create(['fiscal_code' => 'RSSMRA90C15H501O']);

    $this->actingAs($this->user)->postJson("/api/v1/athletes/{$old->id}/restore")->assertOk();

    expect($old->fresh()?->trashed())->toBeFalse();
});

// ─── Where it goes ───────────────────────────────────────────────────────────

it('masks the code in the audit log', function (): void {
    storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H501O'])->assertCreated();

    $entry = AuditEntry::query()->where('action', 'athlete.created')->latest('id')->firstOrFail();

    expect($entry->after['fiscal_code'] ?? null)->toBe('***501O');
});

it('puts the three details in the account export', function (): void {
    Athlete::factory()->for($this->academy)->create([
        'fiscal_code' => 'RSSMRA90C15H501O',
        'sex' => 'm',
        'birth_place' => 'Roma',
    ]);

    $this->actingAs($this->user)->getJson('/api/v1/me/export')
        ->assertOk()
        ->assertJsonPath('data.athletes.0.fiscal_code', 'RSSMRA90C15H501O')
        ->assertJsonPath('data.athletes.0.sex', 'm')
        ->assertJsonPath('data.athletes.0.birth_place', 'Roma');
});

// ─── The import ──────────────────────────────────────────────────────────────

/** @param list<list<string>> $rows */
function federationCsv(array $rows): UploadedFile
{
    $lines = ['Nome;Cognome;Cintura;Codice fiscale;Sesso;Luogo di nascita;Data di nascita'];
    foreach ($rows as $row) {
        $lines[] = implode(';', $row);
    }

    return UploadedFile::fake()->createWithContent('tesserati.csv', implode("\n", $lines) . "\n");
}

it('maps a federation file\'s columns without being told', function (): void {
    $response = $this->actingAs($this->user)
        ->post('/api/v1/athletes/import', ['file' => federationCsv([
            ['Mario', 'Rossi', 'bianca', 'RSSMRA90C15H501O', 'M', 'Roma', '15/03/1990'],
        ])])
        ->assertOk();

    expect($response->json('data.mapping.fiscal_code'))->toBe('Codice fiscale')
        ->and($response->json('data.mapping.sex'))->toBe('Sesso')
        ->and($response->json('data.mapping.birth_place'))->toBe('Luogo di nascita')
        ->and($response->json('data.rows.0.values.fiscal_code'))->toBe('RSSMRA90C15H501O')
        ->and($response->json('data.rows.0.values.sex'))->toBe('m')
        ->and($response->json('data.rows.0.values.birth_place'))->toBe('Roma');
});

it('fills an empty date of birth and sex from the code', function (): void {
    $response = $this->actingAs($this->user)
        ->post('/api/v1/athletes/import', ['file' => federationCsv([
            ['Giulia', 'Bianchi', 'bianca', 'bncgli15h52f205n', '', '', ''],
        ])])
        ->assertOk();

    expect($response->json('data.rows.0.status'))->toBe('ok')
        ->and($response->json('data.rows.0.values.date_of_birth'))->toBe('2015-06-12')
        ->and($response->json('data.rows.0.values.sex'))->toBe('f');
});

it('reads the ways a sex is written', function (string $cell, string $sex): void {
    $response = $this->actingAs($this->user)
        ->post('/api/v1/athletes/import', ['file' => federationCsv([
            ['Mario', 'Rossi', 'bianca', '', $cell, '', ''],
        ])])
        ->assertOk();

    expect($response->json('data.rows.0.values.sex'))->toBe($sex);
})->with([
    ['M', 'm'],
    ['maschio', 'm'],
    ['F', 'f'],
    ['Femmina', 'f'],
    ['female', 'f'],
]);

it('refuses a second row of the same file with the same code', function (): void {
    $response = $this->actingAs($this->user)
        ->post('/api/v1/athletes/import', ['file' => federationCsv([
            ['Mario', 'Rossi', 'bianca', 'RSSMRA90C15H501O', '', '', ''],
            ['Marco', 'Russo', 'bianca', 'RSSMRA90C15H501O', '', '', ''],
        ])])
        ->assertOk();

    expect($response->json('data.rows.0.status'))->toBe('ok')
        ->and($response->json('data.rows.1.status'))->toBe('invalid')
        ->and($response->json('data.rows.1.errors.fiscal_code.0'))->toContain('Row 2');
});

it('counts one person listed twice with their code as a duplicate, not an error', function (): void {
    // A file assembled from two registers: the same athlete, the same code.
    // That is the duplicate the import already skips, not a clash.
    $response = $this->actingAs($this->user)
        ->post('/api/v1/athletes/import', ['file' => federationCsv([
            ['Mario', 'Rossi', 'bianca', 'RSSMRA90C15H501O', '', '', ''],
            ['mario', 'ROSSI', 'bianca', 'RSSMRA90C15H501O', 'M', '', '15/03/1990'],
        ])])
        ->assertOk();

    expect($response->json('data.rows.0.status'))->toBe('ok')
        ->and($response->json('data.rows.1.status'))->toBe('duplicate')
        ->and($response->json('data.rows.1.errors'))->toBe([]);
});

it('counts a re-import of someone on the roster as a duplicate, not an error', function (): void {
    // Re-importing this year's federation register: everyone on it is already
    // on the roster with the same code. The unique rule must not turn every
    // row red before the duplicate check has a chance to recognise them.
    Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'date_of_birth' => '1990-03-15',
        'fiscal_code' => 'RSSMRA90C15H501O',
    ]);

    $response = $this->actingAs($this->user)
        ->post('/api/v1/athletes/import', ['file' => federationCsv([
            ['Mario', 'Rossi', 'bianca', 'RSSMRA90C15H501O', 'M', 'Roma', ''],
        ]), 'validate_only' => false])
        ->assertOk();

    expect($response->json('data.rows.0.status'))->toBe('duplicate')
        ->and($response->json('data.imported'))->toBe(0)
        ->and(Athlete::query()->count())->toBe(1);
});

it('refuses a code the roster holds for someone else', function (): void {
    Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Luigi',
        'last_name' => 'Verdi',
        'fiscal_code' => 'RSSMRA90C15H501O',
    ]);

    $response = $this->actingAs($this->user)
        ->post('/api/v1/athletes/import', ['file' => federationCsv([
            ['Mario', 'Rossi', 'bianca', 'RSSMRA90C15H501O', '', '', ''],
        ])])
        ->assertOk();

    expect($response->json('data.rows.0.status'))->toBe('invalid')
        ->and($response->json('data.rows.0.errors.fiscal_code'))->not->toBeEmpty();
});

it('refuses a row whose code is wrong, with a reason', function (): void {
    $response = $this->actingAs($this->user)
        ->post('/api/v1/athletes/import', ['file' => federationCsv([
            ['Mario', 'Rossi', 'bianca', 'RSSMRA90C15H501A', '', '', ''],
        ])])
        ->assertOk();

    expect($response->json('data.rows.0.status'))->toBe('invalid')
        ->and($response->json('data.rows.0.errors.fiscal_code'))->not->toBeEmpty();
});

// ─── In the owner's language (#2006) ─────────────────────────────────────────

it('says what the code says in the owner\'s language', function (): void {
    $this->user->update(['locale' => 'it']);

    $date = storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H501O', 'date_of_birth' => '1990-03-16'])
        ->assertUnprocessable()
        ->json('errors.fiscal_code.0');
    $sex = storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H501O', 'sex' => 'f'])
        ->assertUnprocessable()
        ->json('errors.fiscal_code.0');
    $invalid = storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H501A'])
        ->assertUnprocessable()
        ->json('errors.fiscal_code.0');

    expect($date)->toBe('Il codice fiscale dice che la data di nascita è il 15/03/1990.')
        ->and($sex)->toBe('Il codice fiscale dice che il sesso è M, non F.')
        ->and($invalid)->toBe('Il codice fiscale non è valido: controllalo sul documento.');
});

it('checks a code sent on its own against the stored date in the owner\'s language', function (): void {
    $this->user->update(['locale' => 'it']);
    $athlete = Athlete::factory()->for($this->academy)->create(['date_of_birth' => '1991-01-01']);

    $message = $this->actingAs($this->user)->putJson("/api/v1/athletes/{$athlete->id}", ['fiscal_code' => 'RSSMRA90C15H501O'])
        ->assertUnprocessable()
        ->json('errors.fiscal_code.0');

    expect($message)->toBe('Il codice fiscale dice che la data di nascita è il 15/03/1990.');
});

it('says a code is taken in the owner\'s language, on a create and on an edit', function (): void {
    $this->user->update(['locale' => 'it']);
    Athlete::factory()->for($this->academy)->create(['fiscal_code' => 'RSSMRA90C15H501O']);
    $other = Athlete::factory()->for($this->academy)->create(['date_of_birth' => '1990-03-15', 'sex' => 'm']);

    $create = storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H501O'])
        ->assertUnprocessable()
        ->json('errors.fiscal_code.0');
    $edit = $this->actingAs($this->user)->putJson("/api/v1/athletes/{$other->id}", ['fiscal_code' => 'RSSMRA90C15H501O'])
        ->assertUnprocessable()
        ->json('errors.fiscal_code.0');

    expect($create)->toBe('Un altro atleta di questa accademia ha già questo codice fiscale.')
        ->and($edit)->toBe($create);
});

it('reports an import in the importer\'s language', function (): void {
    $this->user->update(['locale' => 'it']);

    $response = $this->actingAs($this->user)
        ->post('/api/v1/athletes/import', ['file' => federationCsv([
            ['Mario', 'Rossi', 'bianca', 'RSSMRA90C15H501O', '', '', ''],
            ['Marco', 'Russo', 'bianca', 'RSSMRA90C15H501O', '', '', ''],
            ['Luca', 'Neri', 'bianca', 'BNCGLI15H52F205N', 'M', '', ''],
        ])])
        ->assertOk();

    expect($response->json('data.rows.1.errors.fiscal_code.0'))->toBe('La riga 2 di questo file ha lo stesso codice fiscale.')
        ->and($response->json('data.rows.2.errors.fiscal_code.0'))->toBe('Il codice fiscale dice che il sesso è F, non M.');
});

it('keeps English for an owner who never chose a language', function (): void {
    $message = storeWithFiscalCode($this, ['fiscal_code' => 'RSSMRA90C15H501A'])
        ->assertUnprocessable()
        ->json('errors.fiscal_code.0');

    expect($message)->toBe('The codice fiscale is not valid: check it against the document.');
});
