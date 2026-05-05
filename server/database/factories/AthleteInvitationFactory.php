<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthleteInvitation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<AthleteInvitation>
 */
class AthleteInvitationFactory extends Factory
{
    /**
     * Default state builds a coherent owner → academy → athlete
     * chain, then resolves the invitation's `academy_id` and
     * `sent_by_user_id` from THAT chain. Auto-creating three
     * unrelated factories (Athlete, Academy, User) at random would
     * let a row land where `academy_id !== $athlete->academy_id` —
     * a cross-tenant state production code can never produce.
     * Tests that want explicit control still chain
     * `->for($athlete)->for($academy)`.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        // Build the chain once; closures below resolve via the saved
        // athlete row so the academy_id / sent_by_user_id stay
        // consistent without a second factory invocation.
        $athlete = Athlete::factory();

        return [
            'athlete_id' => $athlete,
            'academy_id' => fn (array $attributes): int => Athlete::query()
                ->whereKey($attributes['athlete_id'])
                ->value('academy_id'),
            'sent_by_user_id' => function (array $attributes): int {
                /** @var Athlete|null $athlete */
                $athlete = Athlete::query()
                    ->with('academy')
                    ->whereKey($attributes['athlete_id'])
                    ->first();

                // Fall back to a fresh user only if the athlete /
                // academy chain didn't resolve (defensive — should
                // never fire in practice). The cast keeps PHPStan
                // happy on the non-null view.
                return $athlete?->academy?->user_id ?? User::factory()->create()->id;
            },
            'email' => fake()->unique()->safeEmail(),
            // Stored hashed — see `AthleteInvitation::hashToken()` for
            // the rationale. Tests that need the *raw* token (e.g.
            // the PR-C accept-flow tests) generate it themselves and
            // pass `token => AthleteInvitation::hashToken($raw)`.
            'token' => AthleteInvitation::hashToken(Str::random(64)),
            'expires_at' => now()->addDays(7),
            'accepted_at' => null,
            'revoked_at' => null,
            'last_sent_at' => now(),
        ];
    }

    public function accepted(): static
    {
        return $this->state(fn (array $attributes) => [
            'accepted_at' => now(),
        ]);
    }

    public function revoked(): static
    {
        return $this->state(fn (array $attributes) => [
            'revoked_at' => now(),
        ]);
    }

    public function expired(): static
    {
        return $this->state(fn (array $attributes) => [
            'expires_at' => now()->subDay(),
        ]);
    }
}
