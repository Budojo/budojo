<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Mail\UnpaidAthletesDigestMail;
use App\Models\AcademyFeeTier;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Carnet;
use App\Models\CarnetEntry;
use App\Models\User;
use App\Notifications\AthletePaymentOverdueNotification;
use App\Support\CarnetAvailability;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;

// helpers live in tests/Pest.php

// Who owes this month (#1722). The roster's payment badge has said "Carnet · 7"
// since #1402, while `?paid=no`, the owner digest and the athlete overdue push
// still asked only whether a payment row existed — so a carnet holder was
// chased by all three, and the owner's own row, which the badge renders as a
// dash, was counted as a debt. One rule now, and these tests hold the three
// readers and the badge to it.

beforeEach(function (): void {
    $this->travelTo('2026-09-20');
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->academy->update(['monthly_fee_cents' => 6000]);
});

/** @return list<int> */
function idsFor(object $test, string $query): array
{
    /** @var list<int> */
    return $test->actingAs($test->user)
        ->getJson("/api/v1/athletes?{$query}")
        ->assertOk()
        ->json('data.*.id');
}

function withSpentEntries(Carnet $carnet, int $spent): Carnet
{
    for ($i = 0; $i < $spent; $i++) {
        CarnetEntry::factory()->for($carnet)->create([
            'attendance_record_id' => AttendanceRecord::factory()->create([
                'athlete_id' => $carnet->athlete_id,
                'attended_on' => CarbonImmutable::today()->subDays($i + 1)->toDateString(),
            ])->id,
        ]);
    }

    return $carnet;
}

// ─── ?paid=no ────────────────────────────────────────────────────────────────

it('leaves an athlete with a spendable carnet out of the unpaid filter', function (): void {
    $carnetHolder = Athlete::factory()->for($this->academy)->create();
    withSpentEntries(Carnet::factory()->for($carnetHolder)->create(['total_entries' => 10]), 3);
    $owing = Athlete::factory()->for($this->academy)->create();

    $ids = idsFor($this, 'paid=no');

    expect($ids)->toContain($owing->id)
        ->and($ids)->not->toContain($carnetHolder->id);
});

it('chases an athlete whose carnet has no entries left', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create();
    withSpentEntries(Carnet::factory()->for($athlete)->create(['total_entries' => 2]), 2);

    expect(idsFor($this, 'paid=no'))->toContain($athlete->id);
});

it('chases an athlete whose carnet has expired', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create();
    Carnet::factory()->for($athlete)->validFrom('2025-08-01')->create();

    expect(idsFor($this, 'paid=no'))->toContain($athlete->id);
});

it('chases an athlete whose carnet only starts next month', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create();
    Carnet::factory()->for($athlete)->validFrom('2026-10-01')->create();

    expect(idsFor($this, 'paid=no'))->toContain($athlete->id);
});

it('leaves the owner training in their own academy out of the unpaid filter', function (): void {
    // The badge renders a dash on this row: the owner is not billed (#750).
    // Counting them made the old widget say 7 where the table showed 3.
    $self = Athlete::factory()->for($this->academy)->selfFor($this->user)->create();

    expect(idsFor($this, 'paid=no'))->not->toContain($self->id);
});

it('leaves an athlete with no fee to pay out of the unpaid filter', function (): void {
    // An academy priced only by tier: an athlete on no tier owes nothing
    // (#1381), and the badge offers no toggle on their row.
    $this->academy->update(['monthly_fee_cents' => null]);
    $tier = AcademyFeeTier::factory()->for($this->academy)->create();
    $onTier = Athlete::factory()->for($this->academy)->create(['fee_tier_id' => $tier->id]);
    $onNoTier = Athlete::factory()->for($this->academy)->create();

    $ids = idsFor($this, 'paid=no');

    expect($ids)->toContain($onTier->id)
        ->and($ids)->not->toContain($onNoTier->id);
});

// ─── ?paid=yes ───────────────────────────────────────────────────────────────

it('counts a spendable carnet as paid', function (): void {
    // A deliberate change, not a side effect: `paid=yes` used to mean "a
    // payment row covers the month" and left carnet holders out. An owner
    // asking who has paid means it the ordinary way.
    $carnetHolder = Athlete::factory()->for($this->academy)->create();
    Carnet::factory()->for($carnetHolder)->create();
    $exhausted = Athlete::factory()->for($this->academy)->create();
    withSpentEntries(Carnet::factory()->for($exhausted)->create(['total_entries' => 1]), 1);

    $ids = idsFor($this, 'paid=yes');

    expect($ids)->toContain($carnetHolder->id)
        ->and($ids)->not->toContain($exhausted->id);
});

// ─── The filter and the badge give one answer ────────────────────────────────

it('agrees with the payment badge on every row of the roster', function (): void {
    $tier = AcademyFeeTier::factory()->for($this->academy)->create();

    $monthly = Athlete::factory()->for($this->academy)->create();
    AthletePayment::factory()->for($monthly)->forCurrentMonth()->create();
    $carnet = Athlete::factory()->for($this->academy)->create();
    withSpentEntries(Carnet::factory()->for($carnet)->create(['total_entries' => 10]), 7);
    $spent = Athlete::factory()->for($this->academy)->create();
    withSpentEntries(Carnet::factory()->for($spent)->create(['total_entries' => 2]), 2);
    Athlete::factory()->for($this->academy)->create();
    Athlete::factory()->for($this->academy)->create(['fee_tier_id' => $tier->id]);
    Athlete::factory()->for($this->academy)->create(['status' => AthleteStatus::Inactive]);
    Athlete::factory()->for($this->academy)->selfFor($this->user)->create();

    $rows = collect($this->actingAs($this->user)
        ->getJson('/api/v1/athletes')
        ->assertOk()
        ->json('data'));

    // The client's rule for the "Unpaid" chip: nothing covers the month, and a
    // payment is expected on this row at all (`paymentNotExpected`).
    $badgeUnpaid = $rows
        ->filter(fn (array $r): bool => $r['payment_coverage'] === 'none'
            && $r['status'] === 'active'
            && $r['is_self'] === false
            && $r['monthly_fee_cents'] !== null)
        ->pluck('id')->sort()->values()->all();
    $badgeCovered = $rows
        ->filter(fn (array $r): bool => $r['payment_coverage'] !== 'none')
        ->pluck('id')->sort()->values()->all();

    expect(collect(idsFor($this, 'paid=no'))->sort()->values()->all())->toBe($badgeUnpaid)
        ->and(collect(idsFor($this, 'paid=yes'))->sort()->values()->all())->toBe($badgeCovered)
        ->and($badgeUnpaid)->toHaveCount(3);
});

// ─── The other two readers ───────────────────────────────────────────────────

it('leaves a carnet holder and the owner out of the owner digest', function (): void {
    $carnetHolder = Athlete::factory()->for($this->academy)->create();
    Carnet::factory()->for($carnetHolder)->create();
    Athlete::factory()->for($this->academy)->selfFor($this->user)->create();
    $owing = Athlete::factory()->for($this->academy)->create();

    Mail::fake();
    $this->artisan('budojo:send-unpaid-athletes-digest')->assertSuccessful();

    Mail::assertQueued(
        UnpaidAthletesDigestMail::class,
        fn (UnpaidAthletesDigestMail $mail): bool => $mail->athletes->pluck('id')->all() === [$owing->id],
    );
});

it('does not push an overdue reminder to an athlete paying by carnet', function (): void {
    $byCarnet = User::factory()->create();
    Carnet::factory()->for(Athlete::factory()->for($this->academy)->create(['user_id' => $byCarnet->id]))->create();
    $owing = User::factory()->create();
    Athlete::factory()->for($this->academy)->create(['user_id' => $owing->id]);

    Notification::fake();
    $this->artisan('budojo:send-athlete-payment-overdue-pushes')->assertSuccessful();

    // The athlete who owes is reminded, so the silence below is the carnet's
    // doing and not a preference or a gate keeping everyone quiet.
    Notification::assertSentTo($owing, AthletePaymentOverdueNotification::class);
    Notification::assertNotSentTo($byCarnet, AthletePaymentOverdueNotification::class);
});

// ─── The SQL dialect of the carnet rule ──────────────────────────────────────

it('selects in SQL exactly the carnets CarnetAvailability calls spendable', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create();
    $today = CarbonImmutable::today();

    Carnet::factory()->for($athlete)->create();
    withSpentEntries(Carnet::factory()->for($athlete)->create(['total_entries' => 3]), 2);
    withSpentEntries(Carnet::factory()->for($athlete)->create(['total_entries' => 2]), 2);
    Carnet::factory()->for($athlete)->validFrom('2026-09-20')->create();
    Carnet::factory()->for($athlete)->validFrom('2026-09-21')->create();
    Carnet::factory()->for($athlete)->create(['valid_from' => '2026-01-01', 'expires_at' => '2026-09-20']);
    Carnet::factory()->for($athlete)->create(['valid_from' => '2026-01-01', 'expires_at' => '2026-09-19']);

    $bySql = Carnet::query()->spendableOn($today)->pluck('id')->sort()->values()->all();
    $byRule = Carnet::query()->withCount('entries')->get()
        ->filter(fn (Carnet $c): bool => CarnetAvailability::isActiveOn($c, $today))
        ->pluck('id')->sort()->values()->all();

    // Both boundaries of the window are inclusive, and a carnet with one
    // entry left is still spendable.
    expect($bySql)->toBe($byRule)->and($bySql)->toHaveCount(4);
});

it('indexes carnet_entries by carnet, which the balance subquery reads per row', function (): void {
    // SQLite does not index a foreign key on its own, and the entity doc used
    // to say it did.
    $indexed = collect(Schema::getIndexes('carnet_entries'))
        ->contains(fn (array $index): bool => $index['columns'] === ['carnet_id']);

    expect($indexed)->toBeTrue();
});
