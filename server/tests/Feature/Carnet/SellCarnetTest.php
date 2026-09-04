<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\Carnet;
use App\Support\CarnetCode;

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->user->academy->update([
        'carnet_price_cents' => 7000,
        'carnet_entries' => 10,
    ]);
    $this->athlete = Athlete::factory()->for($this->user->academy)->create();
});

// ─── POST /athletes/{id}/carnets ──────────────────────────────────────────────

it('sells a carnet and returns 201 with the persisted row', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertCreated()
        ->assertJsonStructure([
            'data' => [
                'id', 'code', 'athlete_id', 'total_entries',
                'remaining_entries', 'price_cents', 'purchased_at', 'expires_at',
            ],
        ])
        ->assertJsonPath('data.total_entries', 10)
        ->assertJsonPath('data.price_cents', 7000);

    expect(Carnet::where('athlete_id', $this->athlete->id)->count())->toBe(1);
});

it('reports a full balance on a freshly sold carnet', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertCreated()
        ->assertJsonPath('data.remaining_entries', 10);
});

it('snapshots price and size so a later config change does not rewrite sold carnets', function (): void {
    $carnetId = $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertCreated()
        ->json('data.id');

    $this->user->academy->update(['carnet_price_cents' => 9000, 'carnet_entries' => 20]);

    $carnet = Carnet::findOrFail($carnetId);
    expect($carnet->price_cents)->toBe(7000)
        ->and($carnet->total_entries)->toBe(10);
});

it('expires twelve months after the purchase date', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => '2026-03-15',
        ])
        ->assertCreated()
        ->assertJsonPath('data.purchased_at', '2026-03-15')
        ->assertJsonPath('data.expires_at', '2027-03-15');
});

it('expires on the last day of February for a leap-day purchase', function (): void {
    // Carbon's default addMonths() would spill to March 1 here.
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => '2024-02-29',
        ])
        ->assertCreated()
        ->assertJsonPath('data.expires_at', '2025-02-28');
});

it('ignores a code, price or size supplied by the client', function (): void {
    // The model is fillable on all three, so the only thing standing between a
    // forged payload and the database is that the controller never forwards
    // request data to the Action. This pins that invariant down.
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'code' => 'ZZZZ',
            'price_cents' => 1,
            'total_entries' => 250,
            'expires_at' => '2099-01-01',
        ])
        ->assertCreated()
        ->assertJsonPath('data.price_cents', 7000)
        ->assertJsonPath('data.total_entries', 10);

    $carnet = Carnet::firstOrFail();
    expect($carnet->code)->not->toBe('ZZZZ')
        ->and($carnet->expires_at->toDateString())->not->toBe('2099-01-01');
});

it('defaults the purchase date to today', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertCreated()
        ->assertJsonPath('data.purchased_at', now()->toDateString());
});

it('accepts a back-dated purchase so the paper register can be transcribed', function (): void {
    $backDated = now()->subMonths(2)->toDateString();

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => $backDated,
        ])
        ->assertCreated()
        ->assertJsonPath('data.purchased_at', $backDated);
});

it('rejects a purchase dated in the future', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => now()->addDay()->toDateString(),
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['purchased_at']);
});

it('returns 422 when the academy has no carnet price configured', function (): void {
    $this->user->academy->update(['carnet_price_cents' => null]);

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['carnet_price_cents']);
});

it('returns 422 when the academy has no carnet size configured', function (): void {
    $this->user->academy->update(['carnet_entries' => null]);

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['carnet_entries']);
});

it('forbids selling a carnet to an athlete of another academy', function (): void {
    $outsider = userWithAcademy();

    $this->actingAs($outsider)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertForbidden();

    expect(Carnet::count())->toBe(0);
});

// ─── Code generation ──────────────────────────────────────────────────────────

it('assigns a distinct code to every carnet sold', function (): void {
    foreach (range(1, 5) as $ignored) {
        $this->actingAs($this->user)
            ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets")
            ->assertCreated();
    }

    expect(Carnet::pluck('code')->unique())->toHaveCount(5);
});

it('redraws the code when the first draw is already taken', function (): void {
    Carnet::factory()->for($this->athlete)->create(['code' => 'AAAA']);

    $this->app->instance(CarnetCode::class, new class () extends CarnetCode {
        private int $draws = 0;

        public function generate(): string
        {
            return $this->draws++ === 0 ? 'AAAA' : 'BBBB';
        }
    });

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertCreated()
        ->assertJsonPath('data.code', 'BBBB');
});

it('gives up loudly when the code space keeps colliding', function (): void {
    Carnet::factory()->for($this->athlete)->create(['code' => 'AAAA']);

    $this->app->instance(CarnetCode::class, new class () extends CarnetCode {
        public function generate(): string
        {
            return 'AAAA';
        }
    });

    $this->withoutExceptionHandling()
        ->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets");
})->throws(RuntimeException::class);
