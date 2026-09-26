<?php

declare(strict_types=1);

use App\Models\Athlete;
use Illuminate\Http\UploadedFile;

/**
 * #1927 — a dan in a sheet is the dan a person holds: "3" is 3° dan. The
 * ladder stores a dan without its offset (1st dan is 0), and the import used
 * to store the number as typed, so every black belt landed one dan too high,
 * and "3°" — not digits — silently became 1st dan.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
});

/** @param list<array{0: string, 1: string}> $rows belt and grade, one per athlete */
function gradesCsv(array $rows, string $gradeHeader = 'Gradi'): UploadedFile
{
    $lines = ["Nome;Cognome;Cintura;{$gradeHeader}"];
    foreach ($rows as $i => [$belt, $grade]) {
        $lines[] = "Atleta;Numero{$i};{$belt};{$grade}";
    }

    return UploadedFile::fake()->createWithContent('atleti.csv', implode("\n", $lines) . "\n");
}

/** @return array<int, array<string, mixed>> the preview rows, by position */
function previewGrades(object $test, UploadedFile $file): array
{
    return $test->actingAs($test->user)->post('/api/v1/athletes/import', ['file' => $file])
        ->assertOk()->json('data.rows');
}

it('reads a judo dan as the dan it is', function (): void {
    $this->user->academy->update(['martial_art' => 'judo']);

    $rows = previewGrades($this, gradesCsv([['Nera', '3'], ['Nera', '1'], ['Nera', '5']]));

    // Stored without the offset: 1st dan is 0, as the form stores it.
    expect(array_column(array_column($rows, 'values'), 'stripes'))->toBe([2, 0, 4])
        ->and(array_column($rows, 'status'))->toBe(['ok', 'ok', 'ok']);
});

it('reads "3°" and "3° dan" as 3° dan, never as nothing', function (): void {
    $this->user->academy->update(['martial_art' => 'judo']);

    $rows = previewGrades($this, gradesCsv([['Nera', '3°'], ['Nera', '3° dan'], ['Nera', '3 DAN']]));

    expect(array_column(array_column($rows, 'values'), 'stripes'))->toBe([2, 2, 2])
        ->and(array_column($rows, 'status'))->toBe(['ok', 'ok', 'ok']);
});

it('refuses a grade it cannot read, with a reason, instead of storing 0', function (): void {
    $this->user->academy->update(['martial_art' => 'judo']);

    $rows = previewGrades($this, gradesCsv([['Nera', 'tre'], ['Nera', 'III']]));

    expect(array_column($rows, 'status'))->toBe(['invalid', 'invalid'])
        ->and($rows[0]['errors']['stripes'][0])->toContain('tre');
});

it('refuses a dan the belt does not carry, in the grade\'s own words', function (): void {
    $this->user->academy->update(['martial_art' => 'judo']);

    $rows = previewGrades($this, gradesCsv([['Nera', '6'], ['Nera', '0']]));

    expect(array_column($rows, 'status'))->toBe(['invalid', 'invalid'])
        ->and($rows[0]['errors']['stripes'][0])->toContain('5° dan')
        ->and($rows[1]['errors']['stripes'][0])->toContain('1° dan');
});

it('reads a "Dan" column without being told', function (): void {
    $this->user->academy->update(['martial_art' => 'judo']);

    $response = $this->actingAs($this->user)->post('/api/v1/athletes/import', ['file' => gradesCsv([['Nera', '2']], 'Dan')])
        ->assertOk();

    expect($response->json('data.mapping.stripes'))->toBe('Dan')
        ->and($response->json('data.rows.0.values.stripes'))->toBe(1);
});

it('applies the same rule to taekwondo poom and dan', function (): void {
    $this->user->academy->update(['martial_art' => 'taekwondo']);

    $rows = previewGrades($this, gradesCsv([['Nera', '4'], ['Nera e rossa', '2']]));

    // Black 1-9 dan, black-and-red 1-4 poom: both stored from 0.
    expect(array_column(array_column($rows, 'values'), 'stripes'))->toBe([3, 1]);
});

it('leaves bjj stripes as they are: two stripes is two', function (): void {
    $rows = previewGrades($this, gradesCsv([['Blu', '2'], ['Viola', '']]));

    expect(array_column(array_column($rows, 'values'), 'stripes'))->toBe([2, 0])
        ->and(array_column($rows, 'status'))->toBe(['ok', 'ok']);
});

it('stores the dan it read when the import is written', function (): void {
    $this->user->academy->update(['martial_art' => 'judo']);

    $this->actingAs($this->user)->post('/api/v1/athletes/import', ['file' => gradesCsv([['Nera', '3']]), 'validate_only' => false])
        ->assertOk();

    expect(Athlete::query()->sole()->stripes)->toBe(2);
});
