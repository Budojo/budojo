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
        // Default: build the academy first, then set the inviter to
        // its primary owner so the (academy, inviter) pair is always
        // consistent. Stand-alone-user inviters were unrelated to the
        // academy under invitation and could surface inviters who
        // don't belong to the academy — incoherent fixture data.
        $academy = Academy::factory()->create();

        return [
            'academy_id' => $academy->id,
            'email' => $this->faker->unique()->safeEmail(),
            'role' => MembershipRole::Instructor,
            'token_hash' => hash('sha256', Str::random(64)),
            'invited_by_user_id' => $academy->user_id ?? User::factory(),
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
