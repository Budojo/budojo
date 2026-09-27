<?php

declare(strict_types=1);

use App\Models\Athlete;

/**
 * #1930 — the check-in reads the whole active roster on one page.
 *
 * Twelve people arrive in five minutes, and half of a 40-athlete room sat on
 * page 2: every name meant paging back and forth at the door. The roster
 * keeps its 20 a page; a caller that wants more says so, up to a cap that
 * keeps one request a request and not a dump of the whole table.
 */
beforeEach(function (): void {
    $this->owner = userWithAcademy();
    Athlete::factory()->count(25)->for($this->owner->academy)->create(['status' => 'active']);
});

it('keeps twenty a page when the caller asks for nothing else', function (): void {
    $this->actingAs($this->owner)->getJson('/api/v1/athletes')
        ->assertOk()
        ->assertJsonCount(20, 'data')
        ->assertJsonPath('meta.per_page', 20)
        ->assertJsonPath('meta.total', 25);
});

it('returns the whole roster on one page when asked', function (): void {
    $this->actingAs($this->owner)->getJson('/api/v1/athletes?per_page=200')
        ->assertOk()
        ->assertJsonCount(25, 'data')
        ->assertJsonPath('meta.per_page', 200)
        ->assertJsonPath('meta.last_page', 1);
});

it('refuses a page size past the cap, or one that is not a size at all', function (mixed $perPage): void {
    $this->actingAs($this->owner)->getJson('/api/v1/athletes?per_page=' . $perPage)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('per_page');
})->with([201, 0, -1, 'all', '2.5']);
