<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\AcademyMembership;
use App\Models\SyllabusTopic;
use App\Models\User;

/**
 * The academy's programme (#1563) — positions, and the techniques under them.
 *
 * Two levels, per academy, soft-deleted: "armbar from closed guard" is a
 * syllabus entry, "armbar" is not, and a topic taken out of the programme
 * must not take the lessons that taught it with it.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
});

function position(Academy $academy, string $name, int $order = 0): SyllabusTopic
{
    return SyllabusTopic::factory()->for($academy)->create(['name' => $name, 'sort_order' => $order]);
}

function technique(SyllabusTopic $position, string $name, int $order = 0): SyllabusTopic
{
    return SyllabusTopic::factory()->under($position)->create(['name' => $name, 'sort_order' => $order]);
}

// ─── GET /academy/syllabus ───────────────────────────────────────────────────

it('lists the positions in order, each with its techniques in order', function (): void {
    $mount = position($this->academy, 'Mount', 1);
    $closed = position($this->academy, 'Closed guard', 0);
    technique($closed, 'Triangle', 1);
    technique($closed, 'Armbar', 0);
    technique($mount, 'Ezekiel');

    $data = $this->actingAs($this->user)
        ->getJson('/api/v1/academy/syllabus')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->json('data');

    expect(array_column($data, 'name'))->toBe(['Closed guard', 'Mount']);
    expect(array_column($data[0]['children'], 'name'))->toBe(['Armbar', 'Triangle']);
    expect($data[0]['children'][0])->toMatchArray(['parent_id' => $closed->id, 'kind' => 'both', 'in_season' => true]);
});

it('never lists another academy programme', function (): void {
    position(Academy::factory()->create(), 'Altrove');

    $this->actingAs($this->user)
        ->getJson('/api/v1/academy/syllabus')
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('leaves deleted topics out of the tree', function (): void {
    $closed = position($this->academy, 'Closed guard');
    technique($closed, 'Armbar')->delete();
    position($this->academy, 'Mount')->delete();

    $data = $this->actingAs($this->user)->getJson('/api/v1/academy/syllabus')->json('data');

    expect(array_column($data, 'name'))->toBe(['Closed guard']);
    expect($data[0]['children'])->toBe([]);
});

// ─── POST /academy/syllabus ──────────────────────────────────────────────────

it('adds a position at the end of the list', function (): void {
    position($this->academy, 'Closed guard', 4);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'Mount', 'kind' => 'both'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Mount')
        ->assertJsonPath('data.parent_id', null)
        ->assertJsonPath('data.in_season', true)
        ->assertJsonPath('data.sort_order', 5);
});

it('adds a technique under a position, after its siblings', function (): void {
    $closed = position($this->academy, 'Closed guard');
    technique($closed, 'Armbar', 2);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'Triangle', 'kind' => 'both', 'parent_id' => $closed->id])
        ->assertCreated()
        ->assertJsonPath('data.parent_id', $closed->id)
        ->assertJsonPath('data.sort_order', 3);
});

it('refuses a third level — a technique cannot be a parent', function (): void {
    $armbar = technique(position($this->academy, 'Closed guard'), 'Armbar');

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'From the top', 'kind' => 'both', 'parent_id' => $armbar->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['parent_id']);
});

it('refuses a parent from another academy', function (): void {
    $foreign = position(Academy::factory()->create(), 'Closed guard');

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'Armbar', 'kind' => 'both', 'parent_id' => $foreign->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['parent_id']);
});

it('refuses a deleted parent', function (): void {
    $closed = position($this->academy, 'Closed guard');
    $closed->delete();

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'Armbar', 'kind' => 'both', 'parent_id' => $closed->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['parent_id']);
});

it('refuses the same name twice among siblings, and allows it under another position', function (): void {
    $closed = position($this->academy, 'Closed guard');
    $mount = position($this->academy, 'Mount');
    technique($closed, 'Armbar');

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'Armbar', 'kind' => 'both', 'parent_id' => $closed->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name']);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'Armbar', 'kind' => 'both', 'parent_id' => $mount->id])
        ->assertCreated();
});

it('frees a name once its holder is deleted', function (): void {
    $closed = position($this->academy, 'Closed guard');
    technique($closed, 'Armbar')->delete();

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'Armbar', 'kind' => 'both', 'parent_id' => $closed->id])
        ->assertCreated();
});

it('rejects a topic it cannot place', function (string $field, array $payload): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors([$field]);
})->with([
    'no name' => ['name', ['kind' => 'both']],
    'name too long' => ['name', ['name' => str_repeat('a', 81), 'kind' => 'both']],
    'unknown kind' => ['kind', ['name' => 'Mount', 'kind' => 'other']],
    'no kind' => ['kind', ['name' => 'Mount']],
]);

// ─── PATCH /academy/syllabus/{topic} ─────────────────────────────────────────

it('changes only what was sent', function (): void {
    $closed = position($this->academy, 'Closed guard');

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$closed->id}", ['name' => 'Guardia chiusa'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Guardia chiusa')
        ->assertJsonPath('data.kind', 'both')
        ->assertJsonPath('data.in_season', true);
});

it('reorders with sort_order', function (): void {
    $closed = position($this->academy, 'Closed guard', 0);
    position($this->academy, 'Mount', 1);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$closed->id}", ['sort_order' => 5])
        ->assertOk();

    $names = array_column($this->actingAs($this->user)->getJson('/api/v1/academy/syllabus')->json('data'), 'name');
    expect($names)->toBe(['Mount', 'Closed guard']);
});

it('unticks every technique under a position when the position is unticked, and ticks them back', function (): void {
    $closed = position($this->academy, 'Closed guard');
    $armbar = technique($closed, 'Armbar');
    $triangle = technique($closed, 'Triangle');
    $mount = position($this->academy, 'Mount');
    $ezekiel = technique($mount, 'Ezekiel');

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$closed->id}", ['in_season' => false])
        ->assertOk()
        ->assertJsonPath('data.in_season', false);

    expect($armbar->refresh()->in_season)->toBeFalse();
    expect($triangle->refresh()->in_season)->toBeFalse();
    expect($ezekiel->refresh()->in_season)->toBeTrue();

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$closed->id}", ['in_season' => true])
        ->assertOk();

    expect($armbar->refresh()->in_season)->toBeTrue();
});

it('unticking one technique leaves its position and its siblings alone', function (): void {
    $closed = position($this->academy, 'Closed guard');
    $armbar = technique($closed, 'Armbar');
    $triangle = technique($closed, 'Triangle');

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$armbar->id}", ['in_season' => false])
        ->assertOk();

    expect($closed->refresh()->in_season)->toBeTrue();
    expect($triangle->refresh()->in_season)->toBeTrue();
});

it('refuses a rename onto a sibling name', function (): void {
    $closed = position($this->academy, 'Closed guard');
    technique($closed, 'Armbar');
    $triangle = technique($closed, 'Triangle');

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$triangle->id}", ['name' => 'Armbar'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name']);

    // Its own name is not a collision.
    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$triangle->id}", ['name' => 'Triangle'])
        ->assertOk();
});

it('answers 404 for a topic that was deleted', function (): void {
    $closed = position($this->academy, 'Closed guard');
    $closed->delete();

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$closed->id}", ['name' => 'X'])
        ->assertNotFound();
});

// ─── DELETE /academy/syllabus/{topic} ────────────────────────────────────────

it('deletes a position with its techniques — softly, so a lesson can still name them', function (): void {
    $closed = position($this->academy, 'Closed guard');
    $armbar = technique($closed, 'Armbar');
    $mount = position($this->academy, 'Mount');

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/academy/syllabus/{$closed->id}")
        ->assertNoContent();

    expect(SyllabusTopic::withTrashed()->find($closed->id)?->trashed())->toBeTrue();
    expect(SyllabusTopic::withTrashed()->find($armbar->id)?->trashed())->toBeTrue();
    expect(SyllabusTopic::withTrashed()->find($armbar->id)?->name)->toBe('Armbar');
    expect($mount->refresh()->trashed())->toBeFalse();
});

it('deletes one technique and leaves its position standing', function (): void {
    $closed = position($this->academy, 'Closed guard');
    $armbar = technique($closed, 'Armbar');
    $triangle = technique($closed, 'Triangle');

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/academy/syllabus/{$armbar->id}")
        ->assertNoContent();

    expect($closed->refresh()->trashed())->toBeFalse();
    expect($triangle->refresh()->trashed())->toBeFalse();
    expect(SyllabusTopic::withTrashed()->find($armbar->id)?->trashed())->toBeTrue();
});

// ─── Scoping and capability ──────────────────────────────────────────────────

it('never touches another academy topic', function (): void {
    $foreign = position(Academy::factory()->create(), 'Closed guard');

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$foreign->id}", ['name' => 'Mine now'])
        ->assertForbidden();
    $this->actingAs($this->user)
        ->deleteJson("/api/v1/academy/syllabus/{$foreign->id}")
        ->assertForbidden();

    expect($foreign->refresh()->name)->toBe('Closed guard');
    expect($foreign->trashed())->toBeFalse();
});

it('lets any member read the programme but only settings-holders write it', function (
    string $role,
    bool $mayWrite,
): void {
    $academy = Academy::factory()->create();
    $member = User::factory()->create(['active_academy_id' => $academy->id]);
    AcademyMembership::factory()->for($member)->for($academy)->create(['role' => $role]);

    $this->actingAs($member)->getJson('/api/v1/academy/syllabus')->assertOk();

    $write = $this->actingAs($member)->postJson('/api/v1/academy/syllabus', ['name' => 'Mount', 'kind' => 'both']);

    $mayWrite ? $write->assertCreated() : $write->assertForbidden();
})->with([
    'owner' => ['owner', true],
    'admin' => ['admin', true],
    'instructor' => ['instructor', false],
    'assistant' => ['assistant', false],
]);

// ─── The academy resource ────────────────────────────────────────────────────

it('counts the techniques in the programme on the academy — positions and deleted ones excluded', function (): void {
    $closed = position($this->academy, 'Closed guard');
    technique($closed, 'Armbar');
    technique($closed, 'Triangle');
    technique($closed, 'Kimura')->delete();
    position($this->academy, 'Mount');

    $this->actingAs($this->user)
        ->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.syllabus_topics_count', 2);
});
