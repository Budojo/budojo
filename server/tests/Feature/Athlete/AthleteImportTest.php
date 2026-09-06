<?php

declare(strict_types=1);

use App\Models\Athlete;
use Illuminate\Http\UploadedFile;

/**
 * Importing a roster from a CSV, end to end (#1346).
 *
 * The file used throughout is deliberately the awkward one: semicolons,
 * Italian headers, Italian belt names, `gg/mm/aaaa` dates and a phone column
 * with no prefix. That is not an edge case — it is what "Save as CSV" produces
 * on an Italian instructor's laptop, and an import that only handles the tidy
 * version handles nothing.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->user->academy->update(['phone_country_code' => '+39', 'phone_national_number' => '0551234567']);
});

/** The shape Excel writes here, header included. */
function rosterCsv(array $rows): UploadedFile
{
    $lines = ['Nome;Cognome;Cintura;Gradi;Data di nascita;Telefono;Data iscrizione'];
    foreach ($rows as $row) {
        $lines[] = implode(';', $row);
    }

    return UploadedFile::fake()->createWithContent('atleti.csv', implode("\n", $lines) . "\n");
}

function importRoster(mixed $test, UploadedFile $file, array $payload = []): \Illuminate\Testing\TestResponse
{
    return $test->actingAs($test->user)->post('/api/v1/athletes/import', ['file' => $file, ...$payload]);
}

it('reads an italian file without being told anything about it', function (): void {
    $response = importRoster($this, rosterCsv([
        ['Marco', 'Rossi', 'blu', '2', '15/03/1990', '333 1234567', '01/09/2024'],
    ]))->assertOk();

    // Delimiter, columns and belt all worked out from the file itself.
    expect($response->json('data.delimiter'))->toBe(';')
        ->and($response->json('data.mapping.first_name'))->toBe('Nome')
        ->and($response->json('data.mapping.last_name'))->toBe('Cognome')
        ->and($response->json('data.rows.0.values.belt'))->toBe('blue')
        ->and($response->json('data.rows.0.values.date_of_birth'))->toBe('1990-03-15')
        ->and($response->json('data.rows.0.values.joined_at'))->toBe('2024-09-01')
        // The phone had no prefix; the academy's own is the evidence used.
        ->and($response->json('data.rows.0.values.phone_country_code'))->toBe('+39')
        ->and($response->json('data.rows.0.values.phone_national_number'))->toBe('3331234567');
});

it('writes nothing on the dry run, which is the default', function (): void {
    // The flag defaults to a dry run precisely so a caller that forgets it
    // gets a preview rather than sixty athletes.
    importRoster($this, rosterCsv([
        ['Marco', 'Rossi', 'blu', '2', '15/03/1990', '', '01/09/2024'],
    ]))->assertOk()->assertJsonPath('data.imported', 1);

    expect(Athlete::query()->count())->toBe(0);
});

it('imports 47 of 50 and reports the 3 it would not', function (): void {
    $rows = [];
    for ($i = 1; $i <= 50; $i++) {
        $rows[] = ["Atleta{$i}", "Cognome{$i}", 'bianca', '0', '', '', '01/09/2024'];
    }
    // Three different ways a real sheet goes wrong: a belt nobody recognises,
    // a missing surname, and a birthday in the future.
    $rows[9] = ['Atleta10', 'Cognome10', 'fucsia', '0', '', '', '01/09/2024'];
    $rows[19] = ['Atleta20', '', 'bianca', '0', '', '', '01/09/2024'];
    $rows[29] = ['Atleta30', 'Cognome30', 'bianca', '0', '15/03/2999', '', '01/09/2024'];

    $response = importRoster($this, rosterCsv($rows), ['validate_only' => false])->assertOk();

    expect($response->json('data.imported'))->toBe(47)
        ->and($response->json('data.skipped'))->toBe(3)
        ->and(Athlete::query()->count())->toBe(47);

    // Reported against the row numbers Excel shows: the header is row 1, so
    // the tenth athlete is row 11.
    $bad = collect($response->json('data.rows'))->where('status', 'invalid');
    expect($bad->pluck('row')->all())->toBe([11, 21, 31])
        ->and($bad->firstWhere('row', 11)['errors'])->toHaveKey('belt')
        ->and($bad->firstWhere('row', 21)['errors'])->toHaveKey('last_name')
        ->and($bad->firstWhere('row', 31)['errors'])->toHaveKey('date_of_birth');
});

it('creates athletes the academy actually owns, with the parsed values', function (): void {
    importRoster($this, rosterCsv([
        ['Marco', 'Rossi', 'cintura blu', '2', '15/03/1990', '+39 333 1234567', '01/09/2024'],
    ]), ['validate_only' => false])->assertOk();

    $athlete = Athlete::query()->sole();
    expect($athlete->academy_id)->toBe($this->user->academy->id)
        ->and($athlete->first_name)->toBe('Marco')
        ->and($athlete->belt->value)->toBe('blue')
        ->and($athlete->stripes)->toBe(2)
        ->and($athlete->status->value)->toBe('active')
        ->and($athlete->phone_national_number)->toBe('3331234567');
});

it('does not import the same roster twice', function (): void {
    $rows = [['Marco', 'Rossi', 'blu', '0', '15/03/1990', '', '01/09/2024']];

    importRoster($this, rosterCsv($rows), ['validate_only' => false])->assertOk();
    $second = importRoster($this, rosterCsv($rows), ['validate_only' => false])->assertOk();

    // The case this exists for: someone runs the import again because they are
    // not sure the first one worked.
    expect($second->json('data.imported'))->toBe(0)
        ->and($second->json('data.rows.0.status'))->toBe('duplicate')
        ->and(Athlete::query()->count())->toBe(1);
});

it('does not import the same person twice from within one file', function (): void {
    // A sheet assembled from two registers. Without this the file imports its
    // own duplicate and nothing ever says so.
    $response = importRoster($this, rosterCsv([
        ['Marco', 'Rossi', 'blu', '0', '15/03/1990', '', '01/09/2024'],
        ['marco', 'ROSSI', 'blu', '0', '15/03/1990', '', '01/09/2024'],
    ]), ['validate_only' => false])->assertOk();

    expect($response->json('data.imported'))->toBe(1)
        ->and($response->json('data.rows.1.status'))->toBe('duplicate');
});

it('lets two real namesakes in when their birthdays differ', function (): void {
    $response = importRoster($this, rosterCsv([
        ['Marco', 'Rossi', 'blu', '0', '15/03/1990', '', '01/09/2024'],
        ['Marco', 'Rossi', 'bianca', '0', '02/07/2008', '', '01/09/2024'],
    ]), ['validate_only' => false])->assertOk();

    // A father and his son train at the same gym. Both are real.
    expect($response->json('data.imported'))->toBe(2);
});

it('says which required column is missing instead of failing every row', function (): void {
    $file = UploadedFile::fake()->createWithContent('atleti.csv', "Nome;Cognome\nMarco;Rossi\n");

    $response = importRoster($this, $file)->assertStatus(422);

    // Sixty identical "belt is required" errors would say nothing about the
    // actual problem, which is a column nobody matched.
    expect($response->json('missing'))->toBe(['belt'])
        ->and($response->json('columns'))->toBe(['Nome', 'Cognome']);
});

it('takes a corrected mapping when the guess was wrong', function (): void {
    $file = UploadedFile::fake()->createWithContent(
        'atleti.csv',
        "Colonna A;Colonna B;Grado\nMarco;Rossi;blu\n",
    );

    $response = importRoster($this, $file, [
        'mapping' => ['first_name' => 'Colonna A', 'last_name' => 'Colonna B'],
    ])->assertOk();

    // The supplied half wins; the guess still fills `belt` from `Grado`, so
    // correcting one column does not mean re-stating the ones already right.
    expect($response->json('data.rows.0.values.first_name'))->toBe('Marco')
        ->and($response->json('data.rows.0.values.belt'))->toBe('blue')
        ->and($response->json('data.imported'))->toBe(1);
});

it('refuses a field name it does not know rather than ignoring it', function (): void {
    importRoster($this, rosterCsv([['Marco', 'Rossi', 'blu', '0', '', '', '']]), [
        'mapping' => ['first_nmae' => 'Nome'],
    ])->assertStatus(422)->assertJsonValidationErrors('mapping');
});

it('refuses a file that is not a csv', function (): void {
    importRoster($this, UploadedFile::fake()->create('roster.pdf', 10, 'application/pdf'))
        ->assertStatus(422)
        ->assertJsonValidationErrors('file');
});

it('refuses an unauthenticated caller', function (): void {
    $this->post('/api/v1/athletes/import', ['file' => rosterCsv([])])->assertUnauthorized();
});

it('never reaches another academy roster', function (): void {
    $other = userWithAcademy();
    importRoster($this, rosterCsv([
        ['Marco', 'Rossi', 'blu', '0', '', '', '01/09/2024'],
    ]), ['validate_only' => false])->assertOk();

    expect($other->academy->athletes()->count())->toBe(0);
});

it('defaults a missing status and joining date rather than refusing the row', function (): void {
    $this->travelTo('2026-09-06');
    $file = UploadedFile::fake()->createWithContent('atleti.csv', "Nome;Cognome;Cintura\nMarco;Rossi;blu\n");

    $response = importRoster($this, $file)->assertOk();

    // A sheet of names and belts is a complete roster. Refusing it for want of
    // a column the academy never kept would be pedantry with a real cost.
    expect($response->json('data.rows.0.values.status'))->toBe('active')
        ->and($response->json('data.rows.0.values.joined_at'))->toBe('2026-09-06')
        ->and($response->json('data.imported'))->toBe(1);
});
