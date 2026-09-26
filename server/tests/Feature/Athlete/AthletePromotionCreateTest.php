<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\CommunityPost;
use App\Support\OperatorDay;

/**
 * Feature tests for `POST /api/v1/athletes/{athlete}/promotions` — the
 * second half of #1431 ("devo poter riscrivere la storia di un atleta"):
 * transcribing a paper register by adding promotions that happened before
 * Budojo existed, for both belts and stripes.
 *
 * The four open questions the issue calls out are answered here:
 *   1. A backfill never touches Athlete::belt / Athlete::stripes — it
 *      writes straight to the AthletePromotion row, so it cannot fire
 *      AthleteObserver and cannot drag the athlete's CURRENT belt around.
 *   2. Ordering: a backfill that contradicts its same-kind neighbours in
 *      the timeline is REFUSED (422), not silently allowed or merely
 *      warned about.
 *   3. recorded_by_user_id is always the authenticated caller — the
 *      person transcribing the register now, never a guess at who
 *      recorded the real-world event.
 *   4. No CommunityPost is ever created by a backfill — the feed would
 *      otherwise flood with celebrations for things that happened years
 *      ago.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create(['belt' => Belt::Blue, 'stripes' => 2]);
    $this->athlete = $athlete;
});

it('creates a standalone belt promotion when there is no surrounding history', function (): void {
    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'white',
            'to_belt' => 'blue',
            'recorded_at' => '2019-03-15',
        ])
        ->assertCreated();

    expect($response->json('data.kind'))->toBe('belt')
        ->and($response->json('data.from_belt'))->toBe('white')
        ->and($response->json('data.to_belt'))->toBe('blue')
        // Derived, not accepted as input — belt_at_event always equals
        // to_belt on a belt-kind row (docs/entities/athlete-promotion.md).
        ->and($response->json('data.belt_at_event'))->toBe('blue')
        ->and($response->json('data.recorded_at'))->toStartWith('2019-03-15')
        ->and($response->json('data.recorded_by.id'))->toBe($this->owner->id);
});

it('creates a standalone stripe promotion when there is no surrounding history', function (): void {
    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'stripe',
            'from_stripes' => 1,
            'to_stripes' => 2,
            'belt_at_event' => 'blue',
            'recorded_at' => '2020-06-01',
        ])
        ->assertCreated();

    expect($response->json('data.kind'))->toBe('stripe')
        ->and($response->json('data.from_stripes'))->toBe(1)
        ->and($response->json('data.to_stripes'))->toBe(2)
        ->and($response->json('data.belt_at_event'))->toBe('blue');
});

it("never changes the athlete's current belt or stripes, and never fires the observer", function (): void {
    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'purple',
            'to_belt' => 'black',
            'recorded_at' => '2015-01-01',
        ])
        ->assertCreated();

    $this->athlete->refresh();
    expect($this->athlete->belt)->toBe(Belt::Blue)
        ->and($this->athlete->stripes)->toBe(2)
        ->and(CommunityPost::count())->toBe(0);
});

it('treats a same-day row as the earlier neighbour even when it carries a real time-of-day', function (): void {
    // A row written live by AthleteObserver carries now() — a real
    // time-of-day — not the midnight a date-only backfill always
    // compares at. Comparing raw datetimes would put this AFTER a
    // same-day backfill (10:00 > 00:00); the rule is that a same-day
    // existing row always counts as earlier, so the chain check has to
    // compare whole calendar days, not the raw timestamps.
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => 'white',
        'to_belt' => 'blue',
        'belt_at_event' => 'blue',
        'recorded_at' => '2020-06-01 10:00:00',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'blue',
            'to_belt' => 'purple',
            'recorded_at' => '2020-06-01',
        ])
        ->assertCreated();
});

it('refuses a backfill whose from_belt disagrees with the previous belt promotion', function (): void {
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => 'white',
        'to_belt' => 'blue',
        'belt_at_event' => 'blue',
        'recorded_at' => '2019-01-01',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            // Contradicts the row above: it says the athlete was already
            // blue on 2019-01-01, this claims they were still white on a
            // LATER date.
            'from_belt' => 'white',
            'to_belt' => 'purple',
            'recorded_at' => '2019-06-01',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['from_belt']);

    expect(AthletePromotion::count())->toBe(1);
});

it('refuses a backfill whose to_belt disagrees with the next belt promotion', function (): void {
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => 'purple',
        'to_belt' => 'brown',
        'belt_at_event' => 'brown',
        'recorded_at' => '2021-01-01',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'blue',
            // Should be 'purple' to hand off to the 2021 row above.
            'to_belt' => 'black',
            'recorded_at' => '2020-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['to_belt']);
});

it('checks against the NEAREST future belt promotion, not the farthest one', function (): void {
    // Two rows after the backfill date, on purpose: `neighbour()` reads
    // `Athlete::promotions()`, which bakes in its own `recorded_at DESC,
    // id DESC` order for the read-timeline use case — a query that
    // merely appends an ascending order on top (rather than resetting
    // it first) would keep returning the farthest of the two rather
    // than the nearest, and a single-future-row test can't see that.
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => 'purple',
        'to_belt' => 'brown',
        'belt_at_event' => 'brown',
        'recorded_at' => '2021-01-01', // the NEAR one
        'recorded_by_user_id' => $this->owner->id,
    ]);
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => 'brown',
        'to_belt' => 'black',
        'belt_at_event' => 'black',
        'recorded_at' => '2023-01-01', // the FAR one
        'recorded_by_user_id' => $this->owner->id,
    ]);

    // Hands off correctly to the NEAR row (purple) — must be refused if
    // checked against the far row instead.
    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'blue',
            'to_belt' => 'purple',
            'recorded_at' => '2020-01-01',
        ])
        ->assertCreated();

    // Hands off correctly to the FAR row (brown) instead — must be
    // refused if checked against the near row (purple).
    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'blue',
            'to_belt' => 'brown',
            'recorded_at' => '2020-06-01',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['to_belt']);
});

it('accepts a backfill that correctly bridges an existing gap', function (): void {
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => 'white',
        'to_belt' => 'blue',
        'belt_at_event' => 'blue',
        'recorded_at' => '2019-01-01',
        'recorded_by_user_id' => $this->owner->id,
    ]);
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => 'purple',
        'to_belt' => 'brown',
        'belt_at_event' => 'brown',
        'recorded_at' => '2022-01-01',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'blue',
            'to_belt' => 'purple',
            'recorded_at' => '2020-06-01',
        ])
        ->assertCreated();

    expect(AthletePromotion::count())->toBe(3);
});

it('refuses a stripe backfill whose from_stripes disagrees with the previous stripe promotion', function (): void {
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'stripe',
        'from_stripes' => 0,
        'to_stripes' => 1,
        'belt_at_event' => 'blue',
        'recorded_at' => '2019-01-01',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'stripe',
            'from_stripes' => 0,
            'to_stripes' => 2,
            'belt_at_event' => 'blue',
            'recorded_at' => '2019-06-01',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['from_stripes']);
});

it('refuses a stripe backfill whose to_stripes disagrees with the next stripe promotion', function (): void {
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'stripe',
        'from_stripes' => 2,
        'to_stripes' => 3,
        'belt_at_event' => 'blue',
        'recorded_at' => '2021-01-01',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'stripe',
            'from_stripes' => 0,
            // Should be 2 to hand off to the 2021 row above.
            'to_stripes' => 1,
            'belt_at_event' => 'blue',
            'recorded_at' => '2020-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['to_stripes']);
});

it('accepts a stripe backfill that correctly bridges an existing gap, checking the NEAREST neighbours', function (): void {
    // Same shape as the belt gap-bridging test, plus a second future row
    // (regression coverage for the reorder()/nearest-neighbour fix).
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'stripe',
        'from_stripes' => 0,
        'to_stripes' => 1,
        'belt_at_event' => 'blue',
        'recorded_at' => '2019-01-01',
        'recorded_by_user_id' => $this->owner->id,
    ]);
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'stripe',
        'from_stripes' => 3,
        'to_stripes' => 4,
        'belt_at_event' => 'blue',
        'recorded_at' => '2020-08-01', // the NEAR future row
        'recorded_by_user_id' => $this->owner->id,
    ]);
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'stripe',
        'from_stripes' => 0,
        'to_stripes' => 1,
        'belt_at_event' => 'purple',
        'recorded_at' => '2022-01-01', // the FAR future row
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'stripe',
            'from_stripes' => 1,
            'to_stripes' => 3,
            'belt_at_event' => 'blue',
            'recorded_at' => '2020-06-01',
        ])
        ->assertCreated();

    expect(AthletePromotion::where('kind', 'stripe')->count())->toBe(4);
});

it('rejects a belt promotion where from_belt equals to_belt', function (): void {
    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'blue',
            'to_belt' => 'blue',
            'recorded_at' => '2019-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['to_belt']);
});

it('rejects a stripe promotion where from_stripes equals to_stripes', function (): void {
    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'stripe',
            'from_stripes' => 2,
            'to_stripes' => 2,
            'belt_at_event' => 'blue',
            'recorded_at' => '2019-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['to_stripes']);
});

it('rejects stripes above the per-belt cap', function (): void {
    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'stripe',
            'from_stripes' => 4,
            // Blue only allows 0-4; this is a black-belt-only grau count.
            'to_stripes' => 5,
            'belt_at_event' => 'blue',
            'recorded_at' => '2019-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['to_stripes']);
});

it('rejects a future recorded_at', function (): void {
    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'white',
            'to_belt' => 'blue',
            'recorded_at' => OperatorDay::today()->addDay()->toDateString(),
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['recorded_at']);
});

it('rejects a stripe payload carrying belt fields', function (): void {
    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'stripe',
            'from_stripes' => 1,
            'to_stripes' => 2,
            'belt_at_event' => 'blue',
            'to_belt' => 'blue',
            'recorded_at' => '2019-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['to_belt']);
});

it('rejects cross-academy creates with 403', function (): void {
    $otherOwner = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($otherOwner->academy)->create();

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'white',
            'to_belt' => 'blue',
            'recorded_at' => '2019-01-01',
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);
});

it('rejects unauthenticated callers with 401', function (): void {
    $this->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
        'kind' => 'belt',
        'from_belt' => 'white',
        'to_belt' => 'blue',
        'recorded_at' => '2019-01-01',
    ])->assertStatus(401);
});
