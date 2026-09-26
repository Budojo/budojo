<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Models\AcademyFeeTier;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\Carnet;
use App\Models\User;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;

/**
 * What September should have been, what came in, and who is still out (#1758).
 *
 * The fixture is the issue's own table, one athlete per rule, so each of the
 * plausible wrong twins moves a number: count the owner, multiply by the
 * period, forget the carnet or the athlete who trains free.
 */
afterEach(function (): void {
    CarbonImmutable::setTestNow(null);
});

function septemberRoster(): User
{
    CarbonImmutable::setTestNow(CarbonImmutable::create(2026, 9, 20));

    $user = userWithAcademy();
    $academy = $user->academy;
    $cheap = AcademyFeeTier::factory()->for($academy)->create(['label' => 'Due volte', 'amount_cents' => 5500, 'lessons_per_week' => 2]);
    $dear = AcademyFeeTier::factory()->for($academy)->create(['label' => 'Tre volte', 'amount_cents' => 6500, 'lessons_per_week' => 3]);
    // Pinned: the factory draws `joined_at` from the real clock, not the test's,
    // and a joining date is a billing floor (#1742).
    $on = fn (AcademyFeeTier $tier, array $extra = []): Athlete => Athlete::factory()->for($academy)
        ->create(['fee_tier_id' => $tier->id, 'joined_at' => '2025-01-10', ...$extra]);

    // A — paid September.
    AthletePayment::factory()->for($on($cheap))->state(['year' => 2026, 'month' => 9, 'amount_cents' => 5500])->create();
    // B — nothing: the one who owes.
    $on($dear);
    // C — a carnet bought in August, still spendable: covered, not a debt.
    Carnet::factory()->for($on($cheap))->purchasedOn('2026-08-20')->create(['price_cents' => 7000]);
    // D — the owner training in their own academy.
    $on($cheap, ['is_self' => true]);
    // E — gone.
    $on($cheap, ['status' => AthleteStatus::Inactive]);
    // F — trains free.
    $on($cheap, ['fee_override_cents' => 0]);

    return $user;
}

it('adds up the month: expected, collected, outstanding and the rate between them', function (): void {
    Sanctum::actingAs(septemberRoster());

    $data = $this->getJson('/api/v1/stats/payments/summary?year=2026&month=9')->assertOk()->json('data');

    expect($data)->toMatchArray([
        'year' => 2026,
        'month' => 9,
        'currency' => 'EUR',
        // A, B and C: one month's fee each. Not D, E or F.
        'expected_cents' => 17500,
        // A's fee. C's carnet is August's takings, as on the chart.
        'collected_cents' => 5500,
        'outstanding_count' => 1,
        'outstanding_cents' => 6500,
        'estimated' => false,
    ])->and($data['collection_rate'])->toEqualWithDelta(0.314, 0.001);
});

it('counts one month of a longer period, on both sides', function (): void {
    $user = septemberRoster();
    $quarterly = Athlete::factory()->for($user->academy)->create(['fee_override_cents' => 6000, 'joined_at' => '2025-01-10']);
    // A quarter paid in advance in September: €180 for Sep, Oct and Nov.
    AthletePayment::factory()->for($quarterly)->state(['year' => 2026, 'month' => 9, 'period_months' => 3, 'amount_cents' => 18000])->create();
    Sanctum::actingAs($user);

    $data = $this->getJson('/api/v1/stats/payments/summary?year=2026&month=9')->assertOk()->json('data');

    // Expected grows by one month's €60, never by the €180 handed over; the
    // chart books a third of it into September, and so does the tile.
    expect($data['expected_cents'])->toBe(17500 + 6000)
        ->and($data['collected_cents'])->toBe(5500 + 6000)
        ->and($data['outstanding_count'])->toBe(1);
});

it('reads the same collected figure the monthly chart draws for that month', function (): void {
    Sanctum::actingAs(septemberRoster());

    $bar = collect($this->getJson('/api/v1/stats/payments/monthly')->assertOk()->json('data'))
        ->firstWhere('month', '2026-08');
    $tile = $this->getJson('/api/v1/stats/payments/summary?year=2026&month=8')->assertOk()->json('data');

    // August holds C's carnet, sold whole into its month.
    expect($tile['collected_cents'])->toBe($bar['amount_cents'])->toBe(7000);
});

it('says so when the month is not the current one', function (): void {
    Sanctum::actingAs(septemberRoster());

    expect($this->getJson('/api/v1/stats/payments/summary?year=2026&month=8')->assertOk()->json('data.estimated'))->toBeTrue()
        ->and($this->getJson('/api/v1/stats/payments/summary')->assertOk()->json('data'))
        ->toMatchArray(['year' => 2026, 'month' => 9, 'estimated' => false]);
});

it('reads a past month against its own last day, not today', function (): void {
    $user = septemberRoster();
    $tier = AcademyFeeTier::factory()->for($user->academy)->create(['label' => 'Una volta', 'amount_cents' => 4000, 'lessons_per_week' => 1]);
    $late = Athlete::factory()->for($user->academy)->create(['fee_tier_id' => $tier->id, 'joined_at' => '2025-01-10']);
    // Bought on 5 September: spendable today, and no use to August.
    Carnet::factory()->for($late)->purchasedOn('2026-09-05')->create(['price_cents' => 7000]);
    Sanctum::actingAs($user);

    $august = $this->getJson('/api/v1/stats/payments/summary?year=2026&month=8')->assertOk()->json('data');
    $september = $this->getJson('/api/v1/stats/payments/summary?year=2026&month=9')->assertOk()->json('data');

    // August owes: A (paid September only), B, and the late carnet holder.
    // C's carnet was bought on 20 August and covers it.
    expect($august)->toMatchArray(['outstanding_count' => 3, 'outstanding_cents' => 5500 + 6500 + 4000])
        ->and($september)->toMatchArray(['outstanding_count' => 1, 'outstanding_cents' => 6500]);
});

it('owes nothing for a month before someone joined, or before the academy kept its fees here', function (): void {
    $user = septemberRoster();
    $tier = AcademyFeeTier::factory()->for($user->academy)->create(['label' => 'Una volta', 'amount_cents' => 4000, 'lessons_per_week' => 1]);
    // Joined on 10 September: owes September, never August (#1742).
    Athlete::factory()->for($user->academy)->create(['fee_tier_id' => $tier->id, 'joined_at' => '2026-09-10']);
    Sanctum::actingAs($user);

    $august = $this->getJson('/api/v1/stats/payments/summary?year=2026&month=8')->assertOk()->json('data');
    $september = $this->getJson('/api/v1/stats/payments/summary?year=2026&month=9')->assertOk()->json('data');

    expect($august)->toMatchArray(['expected_cents' => 17500, 'outstanding_count' => 2, 'outstanding_cents' => 5500 + 6500])
        ->and($september)->toMatchArray(['expected_cents' => 17500 + 4000, 'outstanding_count' => 2, 'outstanding_cents' => 6500 + 4000]);

    // The academy's own floor: Budojo keeps its fees from September, so August
    // is nobody's debt.
    $user->academy->update(['billing_from' => '2026-09-01']);

    expect($this->getJson('/api/v1/stats/payments/summary?year=2026&month=8')->assertOk()->json('data'))
        ->toMatchArray(['expected_cents' => 0, 'outstanding_count' => 0, 'outstanding_cents' => 0, 'collection_rate' => null]);
});

it('has no rate when nothing is expected', function (): void {
    CarbonImmutable::setTestNow(CarbonImmutable::create(2026, 9, 20));
    Sanctum::actingAs(userWithAcademy());

    $data = $this->getJson('/api/v1/stats/payments/summary')->assertOk()->json('data');

    expect($data['expected_cents'])->toBe(0)
        ->and($data['collection_rate'])->toBeNull();
});

it('only counts its own academy', function (): void {
    $user = septemberRoster();
    $other = userWithAcademy();
    $theirs = Athlete::factory()->for($other->academy)->create(['fee_override_cents' => 9900]);
    AthletePayment::factory()->for($theirs)->state(['year' => 2026, 'month' => 9, 'amount_cents' => 9900])->create();
    Sanctum::actingAs($user);

    expect($this->getJson('/api/v1/stats/payments/summary?year=2026&month=9')->assertOk()->json('data'))
        ->toMatchArray(['expected_cents' => 17500, 'collected_cents' => 5500]);
});

it('refuses a month that is not one', function (string $query): void {
    Sanctum::actingAs(userWithAcademy());

    $this->getJson("/api/v1/stats/payments/summary?{$query}")->assertUnprocessable();
})->with(['year=2026&month=13', 'year=2026&month=0', 'year=abc&month=9', 'month=9']);

it('is not for a user without an academy', function (): void {
    Sanctum::actingAs(User::factory()->create());

    $this->getJson('/api/v1/stats/payments/summary')->assertForbidden();
});
