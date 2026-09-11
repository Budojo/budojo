<?php

declare(strict_types=1);

use App\Actions\Lesson\MaterialiseLessonAction;
use App\Enums\ClassKind;
use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\AcademyMembership;
use App\Models\Lesson;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * The weekly timetable (#1562) — the recurring classes an academy runs.
 *
 * Until this, Budojo knew when an academy trains as a weekday bitmap. An
 * academy with kids at 17:00 and adults at 19:00 on the same Monday had one
 * bucket for both, so "who was at the kids' class" could not be asked.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
});

// ─── GET /academy/classes ────────────────────────────────────────────────────

it('lists the week by day, then by time, with untimed classes last in their day', function (): void {
    $academy = $this->user->academy;
    $wed = AcademyClass::factory()->for($academy)->create(['name' => 'Advanced', 'weekday' => 3, 'starts_at' => '19:00']);
    $monLate = AcademyClass::factory()->for($academy)->create(['name' => 'Fundamentals', 'weekday' => 1, 'starts_at' => '19:00']);
    $monOpen = AcademyClass::factory()->for($academy)->untimed()->create(['name' => 'Open mat', 'weekday' => 1]);
    $monEarly = AcademyClass::factory()->for($academy)->create(['name' => 'Kids', 'weekday' => 1, 'starts_at' => '17:00']);

    $ids = collect($this->actingAs($this->user)
        ->getJson('/api/v1/academy/classes')
        ->assertOk()
        ->assertJsonCount(4, 'data')
        ->json('data'))
        ->pluck('id')
        ->all();

    expect($ids)->toBe([$monEarly->id, $monLate->id, $monOpen->id, $wed->id]);
});

it('never lists another academy classes', function (): void {
    AcademyClass::factory()->create(['name' => 'Altrove']);

    $this->actingAs($this->user)
        ->getJson('/api/v1/academy/classes')
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

// ─── POST /academy/classes ───────────────────────────────────────────────────

it('adds a class to the timetable', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/classes', [
            'name' => 'Kids',
            'weekday' => 1,
            'starts_at' => '17:00',
            'duration_minutes' => 60,
            'kind' => 'gi',
        ])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Kids')
        ->assertJsonPath('data.weekday', 1)
        ->assertJsonPath('data.starts_at', '17:00')
        ->assertJsonPath('data.duration_minutes', 60)
        ->assertJsonPath('data.kind', 'gi');

    expect(AcademyClass::where('academy_id', $this->user->academy->id)->count())->toBe(1);
});

it('accepts a class with no clock time — the academy that does not run by one', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/classes', [
            'name' => 'Open mat',
            'weekday' => 6,
            'kind' => 'both',
        ])
        ->assertCreated()
        ->assertJsonPath('data.starts_at', null)
        ->assertJsonPath('data.duration_minutes', null);
});

it('rejects a class it cannot place on the week', function (string $field, array $payload): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/classes', $payload)
        ->assertStatus(422)
        ->assertJsonValidationErrors($field);
})->with([
    'no name' => ['name', ['weekday' => 1, 'kind' => 'gi']],
    'an eighth weekday' => ['weekday', ['name' => 'Kids', 'weekday' => 7, 'kind' => 'gi']],
    'a time that is not a time' => ['starts_at', ['name' => 'Kids', 'weekday' => 1, 'starts_at' => '7pm', 'kind' => 'gi']],
    'a kind it does not know' => ['kind', ['name' => 'Kids', 'weekday' => 1, 'kind' => 'wrestling']],
    'a duration typed in seconds' => ['duration_minutes', ['name' => 'Kids', 'weekday' => 1, 'duration_minutes' => 3600, 'kind' => 'gi']],
]);

// ─── PATCH /academy/classes/{class} ──────────────────────────────────────────

it('changes only what was sent', function (): void {
    $class = AcademyClass::factory()->for($this->user->academy)
        ->create(['name' => 'Fundamentals', 'weekday' => 1, 'starts_at' => '19:00']);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/classes/{$class->id}", ['starts_at' => '18:30'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Fundamentals')
        ->assertJsonPath('data.weekday', 1)
        ->assertJsonPath('data.starts_at', '18:30');
});

it('leaves an evening that already happened exactly as it was held', function (): void {
    // The timetable is mutable; the past is not. The lesson copied the
    // class at creation and does not look back at it.
    $class = AcademyClass::factory()->for($this->user->academy)
        ->create(['name' => 'Fundamentals', 'weekday' => 1, 'starts_at' => '19:00', 'kind' => ClassKind::Gi]);
    $lesson = app(MaterialiseLessonAction::class)->execute($class, CarbonImmutable::parse('2026-09-07'));

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/classes/{$class->id}", [
            'name' => 'Basics',
            'starts_at' => '18:00',
            'kind' => 'nogi',
        ])
        ->assertOk();

    $lesson->refresh();
    expect($lesson->name)->toBe('Fundamentals')
        ->and($lesson->starts_at)->toBe('19:00')
        ->and($lesson->kind)->toBe(ClassKind::Gi);
});

// ─── DELETE /academy/classes/{class} ─────────────────────────────────────────

it('removes a class from the timetable and keeps the lessons it produced', function (): void {
    $class = AcademyClass::factory()->for($this->user->academy)->create(['name' => 'Kids']);
    $lesson = app(MaterialiseLessonAction::class)->execute($class, CarbonImmutable::parse('2026-09-07'));

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/academy/classes/{$class->id}")
        ->assertNoContent();

    expect(AcademyClass::find($class->id))->toBeNull();

    // Removing next week's slot must never remove the evening people trained.
    $lesson->refresh();
    expect($lesson->academy_class_id)->toBeNull()
        ->and($lesson->name)->toBe('Kids');
    expect(Lesson::count())->toBe(1);
});

// ─── Scoping ─────────────────────────────────────────────────────────────────

it('never touches another academy class', function (): void {
    $foreign = AcademyClass::factory()->create();

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/classes/{$foreign->id}", ['name' => 'Mine now'])
        ->assertForbidden();

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/academy/classes/{$foreign->id}")
        ->assertForbidden();

    expect($foreign->fresh()?->name)->toBe($foreign->name);
});

it('lets any member read the timetable but only settings-holders write it', function (
    string $role,
    bool $mayWrite,
): void {
    $academy = Academy::factory()->create();
    $member = User::factory()->create(['active_academy_id' => $academy->id]);
    AcademyMembership::factory()->for($member)->for($academy)->create(['role' => $role]);

    $this->actingAs($member)->getJson('/api/v1/academy/classes')->assertOk();

    $write = $this->actingAs($member)->postJson('/api/v1/academy/classes', [
        'name' => 'Kids',
        'weekday' => 1,
        'kind' => 'gi',
    ]);

    $mayWrite ? $write->assertCreated() : $write->assertForbidden();
})->with([
    'owner' => ['owner', true],
    'admin' => ['admin', true],
    'instructor' => ['instructor', false],
    'assistant' => ['assistant', false],
]);
