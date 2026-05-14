<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\MembershipRole;
use App\Models\Academy;
use App\Models\AcademyInvitation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<AcademyInvitation>
 */
class AcademyInvitationFactory extends Factory
{
    protected $model = AcademyInvitation::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        // Use Closure-style attributes so `invited_by_user_id` is
        // derived from the FINAL `academy_id` — including the one
        // set via `->for($academy)`. The previous shape eagerly
        // created an internal academy + bound the inviter to it,
        // so a caller doing `->for($differentAcademy)` ended up
        // with an inviter who was not a member of the resulting
        // invitation's academy AND a stray internal academy
        // persisted as a side effect. Copilot review on #723.
        return [
            'academy_id' => Academy::factory(),
            'email' => $this->faker->unique()->safeEmail(),
            'role' => MembershipRole::Instructor,
            'token_hash' => hash('sha256', Str::random(64)),
            'invited_by_user_id' => function (array $attributes): int {
                $academyId = $attributes['academy_id'];
                /** @var Academy|null $academy */
                $academy = Academy::query()->find($academyId);

                return $academy?->user_id ?? User::factory()->create()->id;
            },
            'expires_at' => now()->addDays(7),
        ];
    }

    public function expired(): self
    {
        return $this->state(['expires_at' => now()->subDay()]);
    }

    /**
     * Persist the raw token into the caller's reference so a test that
     * exercises the accept endpoint can capture the value. Default
     * `definition()` discards the raw token because tests that don't
     * call accept don't need it.
     *
     * Usage:
     *   $raw = '';
     *   $invitation = AcademyInvitation::factory()
     *       ->withRawToken($raw)
     *       ->create();
     *   $this->postJson('/api/v1/team/invitations/accept', ['token' => $raw]);
     */
    public function withRawToken(string &$rawToken): self
    {
        return $this->state(function () use (&$rawToken): array {
            $rawToken = Str::random(64);

            return ['token_hash' => hash('sha256', $rawToken)];
        });
    }
}
