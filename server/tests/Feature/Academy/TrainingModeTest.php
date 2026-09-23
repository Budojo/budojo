<?php

declare(strict_types=1);

use App\Enums\MartialArt;
use App\Enums\TrainingMode;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use Carbon\CarbonImmutable;

/**
 * Training modes per martial art (#1803).
 *
 * The gi / no-gi split is every art's split: tachi-waza and ne-waza, kata and
 * kumite, poomsae and kyorugi. An academy uses its own pair plus `both` (and
 * `other` on the timetable). Anything else is refused at every door, so no
 * row ends up carrying a mode that no picker in its academy can show.
 *
 * BJJ's behaviour is pinned by the existing timetable, programme, suggestion
 * and coverage tests, which run unchanged against a BJJ academy.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->academy->update(['martial_art' => MartialArt::Karate]);
});

// ─── What the academy says it may use ────────────────────────────────────────

it('sends the academy its own two training modes', function (MartialArt $art, array $modes): void {
    $this->academy->update(['martial_art' => $art]);

    $this->actingAs($this->user)
        ->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.training_modes', $modes);
})->with([
    'bjj' => [MartialArt::Bjj, ['gi', 'nogi']],
    'judo' => [MartialArt::Judo, ['tachi-waza', 'ne-waza']],
    'karate' => [MartialArt::Karate, ['kata', 'kumite']],
    'taekwondo' => [MartialArt::Taekwondo, ['poomsae', 'kyorugi']],
]);

// ─── The timetable ───────────────────────────────────────────────────────────

it('takes a class in one of the academy own modes, or both, or other', function (string $kind): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/classes', ['name' => 'Evening', 'weekday' => 2, 'kind' => $kind])
        ->assertCreated()
        ->assertJsonPath('data.kind', $kind);
})->with(['kata', 'kumite', 'both', 'other']);

it('refuses a class in another art mode, gi included', function (string $kind): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/classes', ['name' => 'Evening', 'weekday' => 2, 'kind' => $kind])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('kind');

    expect(AcademyClass::query()->where('academy_id', $this->academy->id)->exists())->toBeFalse();
})->with(['gi', 'nogi', 'tachi-waza', 'poomsae', 'sparring']);

it('refuses to move a class into another art mode', function (): void {
    $class = AcademyClass::factory()->for($this->academy)->create(['kind' => TrainingMode::Kata]);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/classes/{$class->id}", ['kind' => 'gi'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('kind');

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/classes/{$class->id}", ['kind' => 'kumite'])
        ->assertOk()
        ->assertJsonPath('data.kind', 'kumite');
});

it('keeps a ten-character mode whole on the class and on the lesson it produces', function (): void {
    // The `kind` columns are declared varchar(8) and `tachi-waza` is ten
    // characters. SQLite does not enforce a declared length, which is why no
    // table rebuild widens them — this is the test that says so.
    $this->academy->update(['martial_art' => MartialArt::Judo]);
    $class = AcademyClass::factory()->for($this->academy)->create(['kind' => TrainingMode::TachiWaza]);
    $lesson = Lesson::factory()->forClass($class, '2026-11-18')->create();

    expect($class->fresh()?->kind)->toBe(TrainingMode::TachiWaza)
        ->and($lesson->fresh()?->kind)->toBe(TrainingMode::TachiWaza);
});

// ─── The programme ───────────────────────────────────────────────────────────

it('takes a topic in one of the academy own modes, or both', function (string $kind): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'Saifa', 'kind' => $kind])
        ->assertCreated()
        ->assertJsonPath('data.kind', $kind);
})->with(['kata', 'kumite', 'both']);

it('refuses a topic in another art mode, and other — a topic is the art', function (string $kind): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'Saifa', 'kind' => $kind])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('kind');
})->with(['gi', 'ne-waza', 'kyorugi', 'other']);

it('refuses to move a topic into another art mode', function (): void {
    $topic = SyllabusTopic::factory()->for($this->academy)->create(['kind' => TrainingMode::Kata]);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$topic->id}", ['kind' => 'nogi'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('kind');
});

// ─── What tonight's class is told to teach ───────────────────────────────────

it('tells a kata class to teach kata and either-way techniques, never kumite', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-11-18'));
    $class = AcademyClass::factory()->for($this->academy)->create(['kind' => TrainingMode::Kata]);
    $kihon = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Kihon', 'sort_order' => 1]);
    SyllabusTopic::factory()->under($kihon)->create(['name' => 'Saifa', 'sort_order' => 1, 'kind' => TrainingMode::Kata]);
    SyllabusTopic::factory()->under($kihon)->create(['name' => 'Kakie', 'sort_order' => 2, 'kind' => TrainingMode::Kumite]);
    SyllabusTopic::factory()->under($kihon)->create(['name' => 'Sanchin dachi', 'sort_order' => 3, 'kind' => TrainingMode::Both]);

    $names = collect($this->actingAs($this->user)
        ->getJson("/api/v1/lessons/suggestions?academy_class_id={$class->id}")
        ->assertOk()
        ->json('data'))
        ->pluck('name')
        ->all();

    expect($names)->toBe(['Saifa', 'Sanchin dachi']);
});

// ─── The coverage filter ─────────────────────────────────────────────────────

it('filters coverage by the academy own modes, each admitting both', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-11-18'));
    $class = AcademyClass::factory()->for($this->academy)->create(['kind' => TrainingMode::Kata]);
    $kihon = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Kihon']);
    $saifa = SyllabusTopic::factory()->under($kihon)->create(['name' => 'Saifa', 'kind' => TrainingMode::Kata]);
    SyllabusTopic::factory()->under($kihon)->create(['name' => 'Kakie', 'kind' => TrainingMode::Kumite]);
    SyllabusTopic::factory()->under($kihon)->create(['name' => 'Sanchin dachi', 'kind' => TrainingMode::Both]);

    $lesson = Lesson::factory()->forClass($class, '2026-11-16')->create();
    $lesson->topics()->sync([$saifa->id]);
    AttendanceRecord::create([
        'athlete_id' => Athlete::factory()->for($this->academy)->create()->id,
        'lesson_id' => $lesson->id,
        'attended_on' => '2026-11-16',
    ]);

    $kata = $this->actingAs($this->user)
        ->getJson('/api/v1/stats/syllabus/coverage?kind=kata')
        ->assertOk()
        ->json('data');

    expect($kata['kind'])->toBe('kata')
        ->and($kata['totals']['in_scope'])->toBe(2);

    expect($this->actingAs($this->user)
        ->getJson('/api/v1/stats/syllabus/coverage?kind=kumite')
        ->assertOk()
        ->json('data.totals.in_scope'))->toBe(2);
});

it('refuses a coverage filter from another art, and both — every filter already admits it', function (string $kind): void {
    $this->actingAs($this->user)
        ->getJson("/api/v1/stats/syllabus/coverage?kind={$kind}")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('kind');
})->with(['gi', 'tachi-waza', 'both', 'other']);
