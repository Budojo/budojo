<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Enums\MartialArt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Http\UploadedFile;

/**
 * Belts are judged against the academy's martial art's ladder (#1800), at
 * every door a belt comes in by: the form, the edit, the CSV import and the
 * promotion backfill. The stripe cap is the grade's, not a global one.
 */

function ownerOf(MartialArt $art): User
{
    $owner = userWithAcademy();
    $owner->academy->update(['martial_art' => $art]);

    return $owner->fresh();
}

function athletePayload(array $overrides = []): array
{
    return [
        'first_name' => 'Anna',
        'last_name' => 'Verdi',
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2025-09-01',
        ...$overrides,
    ];
}

it('refuses a belt the martial art does not award, on create', function (): void {
    $this->actingAs(ownerOf(MartialArt::Judo))
        ->postJson('/api/v1/athletes', athletePayload(['belt' => 'purple']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['belt' => "The purple belt is not one this academy's martial art awards."]);
});

it('accepts a half-belt where the martial art awards one', function (): void {
    $this->actingAs(ownerOf(MartialArt::Judo))
        ->postJson('/api/v1/athletes', athletePayload(['belt' => 'white-and-yellow']))
        ->assertCreated()
        ->assertJsonPath('data.belt', 'white-and-yellow');
});

it('keeps BJJ exactly as it was: purple yes, half-belts no', function (): void {
    $owner = userWithAcademy();

    $this->actingAs($owner)->postJson('/api/v1/athletes', athletePayload(['belt' => 'purple', 'stripes' => 4]))->assertCreated();
    $this->actingAs($owner)->postJson('/api/v1/athletes', athletePayload(['first_name' => 'Bea', 'belt' => 'white-and-yellow']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('belt');
});

it('refuses a belt outside the ladder on edit, judged by the athlete\'s academy', function (): void {
    $owner = ownerOf(MartialArt::Taekwondo);
    $athlete = Athlete::factory()->for($owner->academy)->create(['belt' => Belt::Yellow, 'stripes' => 0]);

    $this->actingAs($owner)->putJson("/api/v1/athletes/{$athlete->id}", ['belt' => 'brown'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('belt');
    $this->actingAs($owner)->putJson("/api/v1/athletes/{$athlete->id}", ['belt' => 'yellow-and-green'])
        ->assertOk();
});

it('caps stripes by the grade in the ladder', function (MartialArt $art, string $belt, int $allowed): void {
    $owner = ownerOf($art);

    $this->actingAs($owner)->postJson('/api/v1/athletes', athletePayload(['belt' => $belt, 'stripes' => $allowed]))
        ->assertCreated();
    $this->actingAs($owner)->postJson('/api/v1/athletes', athletePayload(['first_name' => 'Over', 'belt' => $belt, 'stripes' => $allowed + 1]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('stripes');
})->with([
    'judo black: 1st-5th dan' => [MartialArt::Judo, 'black', 4],
    'judo green: no stripes' => [MartialArt::Judo, 'green', 0],
    'karate green: three tacche' => [MartialArt::Karate, 'green', 3],
    'taekwondo poom: 1st-4th' => [MartialArt::Taekwondo, 'black-and-red', 3],
    'taekwondo black: 1st-9th dan' => [MartialArt::Taekwondo, 'black', 8],
    'bjj black: six graus' => [MartialArt::Bjj, 'black', 6],
]);

it('refuses a belt outside the ladder in the import preview, naming the reason', function (): void {
    $owner = ownerOf(MartialArt::Judo);
    $csv = UploadedFile::fake()->createWithContent('atleti.csv', "Nome;Cognome;Cintura\nAnna;Verdi;viola\nBea;Neri;bianco-gialla\n");

    $response = $this->actingAs($owner)->post('/api/v1/athletes/import', ['file' => $csv])->assertOk();

    $rows = collect($response->json('data.rows'));
    expect($rows->firstWhere('row', 2)['status'])->toBe('invalid')
        ->and($rows->firstWhere('row', 2)['errors']['belt'][0])->toContain('not one this academy')
        ->and($rows->firstWhere('row', 3)['values']['belt'])->toBe('white-and-yellow')
        ->and($rows->firstWhere('row', 3)['status'])->not->toBe('invalid');
});

it('refuses a backfilled promotion to a belt the martial art does not award', function (): void {
    $owner = ownerOf(MartialArt::Karate);
    $athlete = Athlete::factory()->for($owner->academy)->create(['belt' => Belt::Green, 'stripes' => 0]);

    $this->actingAs($owner)->postJson("/api/v1/athletes/{$athlete->id}/promotions", [
        'kind' => 'belt', 'from_belt' => 'white', 'to_belt' => 'purple', 'recorded_at' => '2024-03-01',
    ])->assertUnprocessable()->assertJsonValidationErrors('to_belt');

    $this->actingAs($owner)->postJson("/api/v1/athletes/{$athlete->id}/promotions", [
        'kind' => 'stripe', 'from_stripes' => 3, 'to_stripes' => 4, 'belt_at_event' => 'green', 'recorded_at' => '2024-03-01',
    ])->assertUnprocessable()->assertJsonValidationErrors('to_stripes');
});

it('sorts the roster by the academy\'s own ladder', function (): void {
    // Taekwondo: red is the 2nd kup — below the poom, below black. On a BJJ
    // ladder red would be the grand master and sort above everyone.
    $owner = ownerOf(MartialArt::Taekwondo);
    /** @var Academy $academy */
    $academy = $owner->academy;
    foreach (['black' => 'Uno', 'red' => 'Due', 'black-and-red' => 'Tre', 'white' => 'Quattro'] as $belt => $name) {
        Athlete::factory()->for($academy)->create(['belt' => $belt, 'stripes' => 0, 'last_name' => $name]);
    }

    $belts = collect($this->actingAs($owner)->getJson('/api/v1/athletes?sort_by=belt&sort_order=desc')->assertOk()->json('data'))
        ->pluck('belt')->all();

    expect($belts)->toBe(['black', 'black-and-red', 'red', 'white']);
});

it('enrols the owner on the martial art\'s adult starting belt', function (): void {
    $owner = ownerOf(MartialArt::Karate);

    $this->actingAs($owner)->postJson('/api/v1/me/athlete')->assertSuccessful();

    expect($owner->academy->athletes()->where('user_id', $owner->id)->first()?->belt)->toBe(Belt::White);
});
