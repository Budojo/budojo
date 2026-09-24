<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\SyllabusTopic;

// helpers live in tests/Pest.php

/**
 * Reordering the programme (#1661).
 *
 * A programme is taught in an order, and until now nothing changed it: the
 * starter shipped in a sensible one and an academy's own techniques landed at
 * the end. One step at a time, up or down among the item's siblings — the
 * techniques of its position, or the positions of the academy.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
});

function reorderPosition(Academy $academy, string $name, int $order = 0): SyllabusTopic
{
    return SyllabusTopic::factory()->for($academy)->create(['name' => $name, 'sort_order' => $order]);
}

function reorderTechnique(SyllabusTopic $position, string $name, int $order = 0): SyllabusTopic
{
    return SyllabusTopic::factory()->under($position)->create(['name' => $name, 'sort_order' => $order]);
}

function reorderMove(object $test, SyllabusTopic $topic, string $direction): \Illuminate\Testing\TestResponse
{
    return $test->actingAs($test->user)
        ->postJson("/api/v1/academy/syllabus/{$topic->id}/move", ['direction' => $direction]);
}

/** @return list<string> */
function reorderTechniquesOf(object $test, SyllabusTopic $position): array
{
    /** @var list<array{id: int, children: list<array{name: string}>}> $positions */
    $positions = $test->actingAs($test->user)->getJson('/api/v1/academy/syllabus')->json('data');
    $row = collect($positions)->firstWhere('id', $position->id);

    return array_column($row['children'], 'name');
}

it('moves a technique one place up among its siblings, and answers with the new order', function (): void {
    $guard = reorderPosition($this->academy, 'Closed guard');
    reorderTechnique($guard, 'Armbar', 0);
    reorderTechnique($guard, 'Triangle', 1);
    $omoplata = reorderTechnique($guard, 'Omoplata', 2);

    reorderMove($this, $omoplata, 'up')
        ->assertOk()
        ->assertJsonPath('data.0.name', 'Armbar')
        ->assertJsonPath('data.1.name', 'Omoplata')
        ->assertJsonPath('data.2.name', 'Triangle');

    expect(reorderTechniquesOf($this, $guard))->toBe(['Armbar', 'Omoplata', 'Triangle']);
});

it('moves a position down among the positions', function (): void {
    $mount = reorderPosition($this->academy, 'Mount', 0);
    reorderPosition($this->academy, 'Back', 1);

    reorderMove($this, $mount, 'down')->assertOk();

    expect(array_column($this->actingAs($this->user)->getJson('/api/v1/academy/syllabus')->json('data'), 'name'))
        ->toBe(['Back', 'Mount']);
});

it('orders by what the owner sees, even where sort orders tie', function (): void {
    // An academy's own techniques used to land with whatever order the create
    // computed, and a seeded programme can hold equal values — the list then
    // falls back to the name. The move has to start from that same order,
    // and leaves every sibling a distinct place.
    $guard = reorderPosition($this->academy, 'Closed guard');
    reorderTechnique($guard, 'Armbar', 0);
    reorderTechnique($guard, 'Kimura', 0);
    $collar = reorderTechnique($guard, 'Collar choke', 0);

    // Seen as Armbar, Collar choke, Kimura; Collar choke goes up.
    reorderMove($this, $collar, 'up')->assertOk();

    expect(reorderTechniquesOf($this, $guard))->toBe(['Collar choke', 'Armbar', 'Kimura'])
        ->and(SyllabusTopic::query()->where('parent_id', $guard->id)->orderBy('sort_order')->pluck('sort_order')->all())
        ->toBe([0, 1, 2]);
});

it('does nothing past either end', function (): void {
    $guard = reorderPosition($this->academy, 'Closed guard');
    $first = reorderTechnique($guard, 'Armbar', 0);
    $last = reorderTechnique($guard, 'Triangle', 1);

    reorderMove($this, $first, 'up')->assertOk();
    reorderMove($this, $last, 'down')->assertOk();

    expect(reorderTechniquesOf($this, $guard))->toBe(['Armbar', 'Triangle']);
});

it('moves among its own siblings only', function (): void {
    $guard = reorderPosition($this->academy, 'Closed guard', 0);
    $mount = reorderPosition($this->academy, 'Mount', 1);
    reorderTechnique($guard, 'Armbar', 0);
    $cross = reorderTechnique($mount, 'Cross choke', 0);
    reorderTechnique($mount, 'Americana', 1);
    $other = reorderPosition(userWithAcademy()->academy, 'Elsewhere', 0);

    reorderMove($this, $cross, 'down')->assertOk();

    expect(reorderTechniquesOf($this, $mount))->toBe(['Americana', 'Cross choke'])
        ->and(reorderTechniquesOf($this, $guard))->toBe(['Armbar'])
        ->and($other->fresh()->sort_order)->toBe(0);
});

it("refuses another academy's topic, and a direction that is not up or down", function (): void {
    $theirs = reorderPosition(userWithAcademy()->academy, 'Theirs');
    reorderMove($this, $theirs, 'up')->assertForbidden();

    $mine = reorderPosition($this->academy, 'Mine');
    reorderMove($this, $mine, 'sideways')
        ->assertUnprocessable()
        ->assertJsonValidationErrors('direction');
});
