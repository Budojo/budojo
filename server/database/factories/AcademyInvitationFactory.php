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
        // Generate a raw token + its hash — same shape as the runtime
        // accept flow. The factory keeps both around so a test that
        // exercises the accept endpoint can capture the raw value.
        $rawToken = Str::random(64);

        return [
            'academy_id' => Academy::factory(),
            'email' => $this->faker->unique()->safeEmail(),
            'role' => MembershipRole::Instructor,
            'token_hash' => hash('sha256', $rawToken),
            'invited_by_user_id' => User::factory(),
            'expires_at' => now()->addDays(7),
        ];
    }

    public function expired(): self
    {
        return $this->state(['expires_at' => now()->subDay()]);
    }
}
