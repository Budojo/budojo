<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePromotion;

/**
 * Feature tests for `GET /api/v1/athletes/{athlete}/promotions` —
 * owner reads the belt + stripe promotion history for a specific
 * athlete. Same academy-scope gate as the rest of the athlete
 * surface (athlete documents, athlete attendance, …).
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

it('returns the athletes promotion history descending-date for the owner', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create([
        'belt' => Belt::Blue,
        'stripes' => 0,
    ]);

    $this->actingAs($this->owner);

    $athlete->update(['stripes' => 1]);
    $athlete->refresh();
    $athlete->update(['stripes' => 2]);
    $athlete->refresh();
    $athlete->update(['belt' => Belt::Purple, 'stripes' => 0]);

    $response = $this->actingAs($this->owner)
        ->getJson("/api/v1/athletes/{$athlete->id}/promotions")
        ->assertOk();

    $rows = $response->json('data');
    // Most recent first — belt + stripe at the same moment count as two rows.
    expect($rows)->toHaveCount(4)
        ->and($rows[0]['kind'])->toBeIn(['belt', 'stripe'])
        ->and($rows[3]['kind'])->toBe('stripe')
        ->and($rows[3]['from_stripes'])->toBe(0)
        ->and($rows[3]['to_stripes'])->toBe(1);
});

it('paginates at 20 per page', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create();

    // Create 25 promotion rows directly to dodge the observer's
    // belt/stripe-cycling state and just test the pagination shape.
    AthletePromotion::factory()->count(25)->create([
        'athlete_id' => $athlete->id,
        'kind' => 'stripe',
        'from_stripes' => 0,
        'to_stripes' => 1,
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $response = $this->actingAs($this->owner)
        ->getJson("/api/v1/athletes/{$athlete->id}/promotions")
        ->assertOk();

    expect($response->json('data'))->toHaveCount(20)
        ->and($response->json('meta.total'))->toBe(25)
        ->and($response->json('meta.last_page'))->toBe(2);
});

it('rejects cross-academy reads with 403', function (): void {
    $otherOwner = userWithAcademy();
    /** @var Academy $otherAcademy */
    $otherAcademy = $otherOwner->academy;

    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($otherAcademy)->create();

    $this->actingAs($this->owner)
        ->getJson("/api/v1/athletes/{$athlete->id}/promotions")
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);
});

it('rejects unauthenticated callers with 401', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create();

    $this->getJson("/api/v1/athletes/{$athlete->id}/promotions")
        ->assertStatus(401);
});

it('returns an empty list when the athlete has no promotions yet', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create();

    $response = $this->actingAs($this->owner)
        ->getJson("/api/v1/athletes/{$athlete->id}/promotions")
        ->assertOk();

    expect($response->json('data'))->toBe([])
        ->and($response->json('meta.total'))->toBe(0);
});
