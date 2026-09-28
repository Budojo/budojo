<?php

declare(strict_types=1);

use App\Enums\AppLocale;
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
 *   2. Ordering: a backfill that leaves a gap with its neighbours is saved
 *      as typed, and the gap shows as ghost rows (#1991). One that has the
 *      athlete go backwards next to a row already recorded is a 422
 *      `chain_conflict` naming that row, in the owner's language — which
 *      the owner may confirm with `confirm_conflict` and save anyway.
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

it('warns about a belt backfill that starts below the belt held before it, naming that row', function (): void {
    $blue = AthletePromotion::factory()->create([
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
        ->assertJsonPath('code', 'chain_conflict')
        ->assertJsonPath('conflicts', [[
            'field' => 'from_belt',
            'promotion_id' => $blue->id,
            'recorded_at' => '2019-01-01',
            'belt' => 'blue',
            'stripes' => null,
        ]])
        ->assertJsonPath('errors.from_belt.0', 'On 1 January 2019 they were already on a higher belt: this would put them on a lower one.');

    expect(AthletePromotion::count())->toBe(1);
});

it('saves a belt backfill that leaves a gap with the rows around it (#1991)', function (): void {
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => 'white',
        'to_belt' => 'blue',
        'belt_at_event' => 'blue',
        'recorded_at' => '2019-01-01',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    // Blue → purple never written down: purple → brown still saves.
    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'purple',
            'to_belt' => 'brown',
            'recorded_at' => '2023-06-01',
        ])
        ->assertCreated();
});

it('warns about a starting belt typed after a promotion already recorded, and saves it once confirmed', function (): void {
    // «Cintura di partenza» is the dialog's own default for «Da cintura». It
    // says nothing came before — but a promotion did. Compared by the belt
    // it reaches alone, it saved silently whenever that belt was high enough,
    // and wrote a second row shaped like the one every timeline opens with.
    $blue = AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => 'white',
        'to_belt' => 'blue',
        'belt_at_event' => 'blue',
        'recorded_at' => '2019-01-01',
        'recorded_by_user_id' => $this->owner->id,
    ]);
    $firstBelt = ['kind' => 'belt', 'from_belt' => null, 'to_belt' => 'purple', 'recorded_at' => '2020-06-01'];

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", $firstBelt)
        ->assertUnprocessable()
        ->assertJsonPath('code', 'chain_conflict')
        ->assertJsonPath('conflicts', [[
            'field' => 'from_belt',
            'promotion_id' => $blue->id,
            'recorded_at' => '2019-01-01',
            'belt' => 'blue',
            'stripes' => null,
        ]])
        ->assertJsonPath('errors.from_belt.0', "A promotion is already recorded on 1 January 2019: this can't be the starting belt.");
    expect(AthletePromotion::count())->toBe(1);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [...$firstBelt, 'confirm_conflict' => true])
        ->assertCreated();
    expect(AthletePromotion::count())->toBe(2);
});

it('takes a starting belt with nothing recorded before it as it is', function (): void {
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
            'kind' => 'belt', 'from_belt' => null, 'to_belt' => 'white', 'recorded_at' => '2017-03-01',
        ])
        ->assertCreated();
});

it('falls back to English for an owner who never chose a language', function (): void {
    $this->owner->forceFill(['locale' => null])->saveQuietly();
    $owner = $this->owner->fresh();
    expect($owner?->locale)->toBeNull();

    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt', 'from_belt' => 'blue', 'to_belt' => 'blue', 'recorded_at' => '2019-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonPath('errors.to_belt.0', 'The new belt must differ from the previous one.');
});

it('saves a contradiction once the owner confirms it', function (): void {
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
            'from_belt' => 'white',
            'to_belt' => 'purple',
            'recorded_at' => '2019-06-01',
            'confirm_conflict' => true,
        ])
        ->assertCreated();

    expect(AthletePromotion::count())->toBe(2);
});

it('warns about a belt backfill that ends above the belt the next row starts from', function (): void {
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
            // Black before a purple → brown in 2021: backwards.
            'to_belt' => 'black',
            'recorded_at' => '2020-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonPath('code', 'chain_conflict')
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

    // Hands off correctly to the FAR row (brown) — fine against it, but
    // above the NEAR row's purple, so it must be warned about.
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

it('warns about a stripe backfill that overlaps the count held before it', function (): void {
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
        ->assertJsonPath('code', 'chain_conflict')
        ->assertJsonPath('errors.from_stripes.0', 'On 1 January 2019 they already had 1 stripe: this would start them from 0.');
});

it('saves a stripe backfill that leaves a gap before the next row, as the owner typed it (#1991)', function (): void {
    // The owner's report: «Bianca 1 → 2» on 19 March 2025, under a row of
    // 18 November 2025 that starts at 3. The third stripe is simply not
    // written down yet — a gap, which the timeline offers to date.
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'stripe',
        'from_stripes' => 3,
        'to_stripes' => 4,
        'belt_at_event' => 'white',
        'recorded_at' => '2025-11-18',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'stripe',
            'from_stripes' => 1,
            'to_stripes' => 2,
            'belt_at_event' => 'white',
            'recorded_at' => '2025-03-19',
        ])
        ->assertCreated();
});

it('warns in the owner\'s language when a stripe backfill goes backwards (#1991)', function (): void {
    $this->owner->update(['locale' => AppLocale::It]);
    $third = AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'stripe',
        'from_stripes' => 2,
        'to_stripes' => 3,
        'belt_at_event' => 'white',
        'recorded_at' => '2025-11-18',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'stripe',
            'from_stripes' => 1,
            'to_stripes' => 2,
            'belt_at_event' => 'white',
            'recorded_at' => '2025-12-01',
        ])
        ->assertUnprocessable()
        ->assertJsonPath('code', 'chain_conflict')
        ->assertJsonPath('message', 'Il 18 novembre 2025 aveva già 3 gradi: qui arriveresti a 2.')
        ->assertJsonPath('errors.to_stripes.0', 'Il 18 novembre 2025 aveva già 3 gradi: qui arriveresti a 2.')
        ->assertJsonPath('conflicts.0', [
            'field' => 'to_stripes',
            'promotion_id' => $third->id,
            'recorded_at' => '2025-11-18',
            'belt' => 'white',
            'stripes' => 3,
        ]);
});

it('warns about a stripe backfill that ends above the count the next row starts from', function (): void {
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
            'from_stripes' => 1,
            'to_stripes' => 3,
            'belt_at_event' => 'blue',
            'recorded_at' => '2020-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonPath('code', 'chain_conflict')
        ->assertJsonPath('errors.to_stripes.0', 'On 1 January 2021 they still had 2 stripes: this would take them to 3.');
});

it('warns about a stripe on a belt the belt rows say the athlete had not reached yet', function (): void {
    AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => 'white',
        'to_belt' => 'blue',
        'belt_at_event' => 'blue',
        'recorded_at' => '2024-01-10',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'stripe',
            'from_stripes' => 0,
            'to_stripes' => 1,
            'belt_at_event' => 'blue',
            'recorded_at' => '2023-06-01',
        ])
        ->assertUnprocessable()
        ->assertJsonPath('code', 'chain_conflict')
        ->assertJsonPath('errors.belt_at_event.0', 'On 10 January 2024 they were still on a lower belt: this would put them on a higher one.');
});

it('does not call a plain validation error a conflict, and says it in the owner\'s language', function (): void {
    $this->owner->update(['locale' => AppLocale::It]);

    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt',
            'from_belt' => 'blue',
            'to_belt' => 'blue',
            'recorded_at' => '2019-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonPath('errors.to_belt.0', 'La nuova cintura deve essere diversa da quella di prima.');

    expect($response->json())->not->toHaveKey('code');
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
