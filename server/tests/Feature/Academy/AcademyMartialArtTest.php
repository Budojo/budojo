<?php

declare(strict_types=1);

use App\Enums\MartialArt;
use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Models\User;

/**
 * The academy's martial art (#1800): required at creation, echoed with its
 * ladder, and changeable only while nothing in the academy is shaped by it.
 */

it('requires the martial art to create an academy', function (): void {
    $this->actingAs(User::factory()->create())
        ->postJson('/api/v1/academy', ['name' => 'Dojo'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('martial_art');
});

it('refuses a martial art it has no registry for', function (): void {
    $this->actingAs(User::factory()->create())
        ->postJson('/api/v1/academy', ['name' => 'Dojo', 'martial_art' => 'kendo'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('martial_art');
});

it('creates a judo academy and answers with the judo ladder', function (): void {
    $response = $this->actingAs(User::factory()->create())
        ->postJson('/api/v1/academy', ['name' => 'Judo Club', 'martial_art' => 'judo'])
        ->assertCreated()
        ->assertJsonPath('data.martial_art', 'judo')
        ->assertJsonPath('data.martial_art_locked', false)
        ->assertJsonPath('data.syllabus_programmes', []);

    $grades = collect($response->json('data.grades'));
    expect($grades->pluck('belt')->all())->not->toContain('purple')
        ->and($grades->first())->toBe(['belt' => 'white', 'max_stripes' => 0, 'count' => 'stripe', 'first' => 0, 'kids' => false])
        ->and($grades->firstWhere('belt', 'black'))->toBe(['belt' => 'black', 'max_stripes' => 4, 'count' => 'dan', 'first' => 1, 'kids' => false]);
});

it('reads as BJJ for an academy that predates the column', function (): void {
    // The model mirrors the column default in memory, so a factory or a
    // restored backup never holds a null martial art.
    $academy = Academy::factory()->create();

    expect($academy->martial_art)->toBe(MartialArt::Bjj)
        ->and($academy->fresh()?->martial_art)->toBe(MartialArt::Bjj);

    $this->actingAs($academy->owner)->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.martial_art', 'bjj')
        ->assertJsonPath('data.grades.0.belt', 'grey')
        ->assertJsonPath('data.syllabus_programmes', ['bjj']);
});

it('changes the martial art of an empty academy', function (): void {
    $owner = userWithAcademy();

    $this->actingAs($owner)->patchJson('/api/v1/academy', ['martial_art' => 'karate'])
        ->assertOk()
        ->assertJsonPath('data.martial_art', 'karate');

    expect($owner->academy->fresh()?->martial_art)->toBe(MartialArt::Karate);
});

it('locks the martial art once the academy has anything shaped by it', function (Closure $shape): void {
    $owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $owner->academy;
    $shape($academy);

    $this->actingAs($owner)->getJson('/api/v1/academy')->assertJsonPath('data.martial_art_locked', true);
    $this->actingAs($owner)->patchJson('/api/v1/academy', ['martial_art' => 'judo'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('martial_art');

    expect($academy->fresh()?->martial_art)->toBe(MartialArt::Bjj);
})->with([
    'an athlete' => [fn (Academy $a) => Athlete::factory()->for($a)->create()],
    'a deleted athlete' => [fn (Academy $a) => Athlete::factory()->for($a)->create()->delete()],
    'a class' => [fn (Academy $a) => AcademyClass::factory()->for($a)->create()],
    // Lessons outlive their class: null-on-delete, kind snapshotted.
    'a lesson whose class is gone' => [function (Academy $a): void {
        $class = AcademyClass::factory()->for($a)->create();
        Lesson::factory()->for($a)->create(['academy_class_id' => $class->id]);
        $class->delete();
    }],
    // Lesson::topics() reads topics withTrashed(), so a deleted programme still speaks.
    'a deleted topic' => [fn (Academy $a) => SyllabusTopic::factory()->for($a)->create()->delete()],
]);

it('accepts the martial art the academy already has, even when locked', function (): void {
    // A form that posts every field must not fail on the one it did not touch.
    $owner = userWithAcademy();
    Athlete::factory()->for($owner->academy)->create();

    $this->actingAs($owner)->patchJson('/api/v1/academy', ['martial_art' => 'bjj', 'name' => 'Renamed'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Renamed');
});

it('refuses to clear the martial art', function (): void {
    $this->actingAs(userWithAcademy())->patchJson('/api/v1/academy', ['martial_art' => null])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('martial_art');
});
