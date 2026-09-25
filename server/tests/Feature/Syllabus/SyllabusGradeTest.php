<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Models\SyllabusTopic;

/**
 * From which grade a topic belongs to the programme (#1861).
 *
 * In judo, karate and taekwondo a grade has a programme — the throws, the
 * kata, the poomsae an exam asks for. `from_belt` is that link, written once
 * by the owner on the programme: an item marked "from the green belt" is
 * expected of a green belt and of every grade above it. Null is "for
 * everyone". It is a property of the programme, never a mark on a person.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
});

it('starts every topic for everyone', function (): void {
    SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Closed guard']);

    $data = $this->actingAs($this->user)
        ->getJson('/api/v1/academy/syllabus')
        ->assertOk()
        ->json('data');

    expect($data[0])->toHaveKey('from_belt')
        ->and($data[0]['from_belt'])->toBeNull();
});

it('stores the belt a technique belongs to the programme from', function (): void {
    $position = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Mount']);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', [
            'name' => 'Arm triangle',
            'kind' => 'both',
            'parent_id' => $position->id,
            'from_belt' => 'blue',
        ])
        ->assertCreated()
        ->assertJsonPath('data.from_belt', 'blue');

    expect(SyllabusTopic::query()->where('name', 'Arm triangle')->first()?->from_belt)->toBe(Belt::Blue);
});

it('gives a new technique its position belt when none is sent', function (): void {
    $position = SyllabusTopic::factory()->for($this->academy)->create([
        'name' => 'Leg locks', 'from_belt' => Belt::Purple,
    ]);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', [
            'name' => 'Heel hook',
            'kind' => 'both',
            'parent_id' => $position->id,
        ])
        ->assertCreated()
        ->assertJsonPath('data.from_belt', 'purple');
});

it('keeps an explicit "for everyone" under a position that has a belt', function (): void {
    $position = SyllabusTopic::factory()->for($this->academy)->create([
        'name' => 'Leg locks', 'from_belt' => Belt::Purple,
    ]);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', [
            'name' => 'Straight ankle lock',
            'kind' => 'both',
            'parent_id' => $position->id,
            'from_belt' => null,
        ])
        ->assertCreated()
        ->assertJsonPath('data.from_belt', null);
});

it('refuses a belt the academy martial art does not award', function (mixed $belt): void {
    // BJJ awards neither a judo half belt nor a colour that does not exist.
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'Standing', 'kind' => 'both', 'from_belt' => $belt])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['from_belt']);
})->with([
    'a judo half belt' => ['white-and-yellow'],
    'no such colour' => ['pink'],
    'not a string' => [3],
]);

it('reads the ladder of the academy own art', function (): void {
    $this->academy->update(['martial_art' => 'judo']);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', [
            'name' => 'Nage-waza', 'kind' => 'both', 'from_belt' => 'white-and-yellow',
        ])
        ->assertCreated()
        ->assertJsonPath('data.from_belt', 'white-and-yellow');
});

it('sets and clears the belt on an existing topic', function (): void {
    $topic = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Back']);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$topic->id}", ['from_belt' => 'brown'])
        ->assertOk()
        ->assertJsonPath('data.from_belt', 'brown');

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$topic->id}", ['from_belt' => null])
        ->assertOk()
        ->assertJsonPath('data.from_belt', null);

    expect($topic->fresh()?->from_belt)->toBeNull();
});

it('leaves the belt alone on a patch that does not send it', function (): void {
    $topic = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Back', 'from_belt' => Belt::Blue]);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$topic->id}", ['name' => 'Back control'])
        ->assertOk()
        ->assertJsonPath('data.from_belt', 'blue');
});

it('does not cascade a position belt to the techniques already under it', function (): void {
    $position = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Half guard']);
    $sweep = SyllabusTopic::factory()->under($position)->create(['name' => 'Old school sweep']);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$position->id}", ['from_belt' => 'blue'])
        ->assertOk();

    // A position's belt is a default for what is added under it, the rule
    // `kind` follows — not a rewrite of what the owner already decided.
    expect($sweep->fresh()?->from_belt)->toBeNull();
});

it('refuses on a patch a belt the art does not award', function (): void {
    $topic = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Back']);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$topic->id}", ['from_belt' => 'green-and-blue'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['from_belt']);
});
