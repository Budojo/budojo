<?php

declare(strict_types=1);

use App\Actions\Syllabus\SeedSyllabusAction;
use App\Enums\MartialArt;
use App\Enums\TopicKind;
use App\Models\Academy;
use App\Models\AcademyMembership;
use App\Models\SyllabusTopic;
use App\Models\User;
use App\Support\MartialArt\MartialArtProfile;

/**
 * The shipped starter programmes (#1563, #1800) — a starting point the academy owns from
 * the first minute, never a taxonomy imposed on it.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
});

it('copies the whole programme into an empty academy, positions first, self-defence last', function (): void {
    $written = $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus/seed')
        ->assertCreated()
        ->json('data.written');

    $positions = SyllabusTopic::query()->where('academy_id', $this->academy->id)->positions()
        ->orderBy('sort_order')->get();
    $techniques = SyllabusTopic::query()->where('academy_id', $this->academy->id)->whereNotNull('parent_id')->count();

    expect($written)->toBe($positions->count() + $techniques);
    expect($positions->count())->toBeGreaterThan(50);
    expect($techniques)->toBeGreaterThan(250);
    expect($positions->first()?->name)->toBe('Base movements');
    expect($positions->last()?->name)->toBe('Self-defence');
    expect(SyllabusTopic::query()->where('academy_id', $this->academy->id)->where('in_season', false)->exists())->toBeFalse();
});

it('marks what only makes sense in one of gi or no-gi, and inherits the rest from the position', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $kGuard = SyllabusTopic::query()->where('academy_id', $this->academy->id)->where('name', 'K guard')->firstOrFail();
    expect($kGuard->kind)->toBe(TopicKind::NoGi);
    expect($kGuard->children()->pluck('kind')->unique()->all())->toBe([TopicKind::NoGi]);

    $closed = SyllabusTopic::query()->where('academy_id', $this->academy->id)->where('name', 'Closed guard')->firstOrFail();
    expect($closed->children()->where('name', 'Cross collar choke')->firstOrFail()->kind)->toBe(TopicKind::Gi);
    expect($closed->children()->where('name', 'Armbar')->firstOrFail()->kind)->toBe(TopicKind::Both);
});

it('refuses to seed an academy that already has a programme, and writes nothing', function (): void {
    SyllabusTopic::factory()->for($this->academy)->create(['name' => 'My own position']);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus/seed')
        ->assertStatus(409);

    expect(SyllabusTopic::query()->where('academy_id', $this->academy->id)->count())->toBe(1);
});

it('refuses to seed twice', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();
    $before = SyllabusTopic::query()->where('academy_id', $this->academy->id)->count();

    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertStatus(409);

    expect(SyllabusTopic::query()->where('academy_id', $this->academy->id)->count())->toBe($before);
});

it('seeds each academy its own copy', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $other = userWithAcademy();
    $this->actingAs($other)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $mine = SyllabusTopic::query()->where('academy_id', $this->academy->id)->count();
    expect(SyllabusTopic::query()->where('academy_id', $other->academy->id)->count())->toBe($mine);
    expect(SyllabusTopic::query()->count())->toBe(2 * $mine);
});

it('needs the settings capability', function (): void {
    $academy = Academy::factory()->create();
    $instructor = User::factory()->create(['active_academy_id' => $academy->id]);
    AcademyMembership::factory()->for($instructor)->for($academy)->create(['role' => 'instructor']);

    $this->actingAs($instructor)->postJson('/api/v1/academy/syllabus/seed')->assertForbidden();

    expect(SyllabusTopic::query()->where('academy_id', $academy->id)->exists())->toBeFalse();
});

it('names the BJJ programme by its key, or not at all, since BJJ offers one', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus/seed', ['programme' => 'bjj'])
        ->assertCreated();
});

it('refuses a programme the martial art does not offer', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus/seed', ['programme' => 'karate-goju-ryu'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('programme');

    expect(SyllabusTopic::query()->where('academy_id', $this->academy->id)->exists())->toBeFalse();
});

it('answers 404, not 500, for a martial art whose programme has not shipped', function (): void {
    // #1800: a judo academy exists before the judo programme does (#1804).
    $this->academy->update(['martial_art' => MartialArt::Judo]);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus/seed')
        ->assertNotFound()
        ->assertJsonPath('message', 'No starter programme has shipped for this martial art yet.');

    expect(SyllabusTopic::query()->where('academy_id', $this->academy->id)->exists())->toBeFalse();
});

it('ships programme files that parse, name every position once, and repeat no technique within a position', function (): void {
    foreach (MartialArt::cases() as $art) {
        $profile = MartialArtProfile::for($art);
        foreach ($profile->programmes() as $key) {
            $positions = SeedSyllabusAction::positions((string) $profile->programmeFile($key));

            $positionNames = array_column($positions, 'name');
            expect($positionNames)->toBe(array_values(array_unique($positionNames)), $key);

            foreach ($positions as $position) {
                expect($position['name'])->not->toBe('');
                expect(mb_strlen($position['name']))->toBeLessThanOrEqual(80);
                expect($position['kind'])->toBeInstanceOf(TopicKind::class);
                expect($position['techniques'])->not->toBe([]);

                $names = array_column($position['techniques'], 'name');
                expect($names)->toBe(array_values(array_unique($names)), "{$key}: {$position['name']} repeats a technique");
                foreach ($position['techniques'] as $technique) {
                    expect(mb_strlen($technique['name']))->toBeLessThanOrEqual(80);
                    expect($technique['kind'])->toBeInstanceOf(TopicKind::class);
                }
            }
        }
    }
});
