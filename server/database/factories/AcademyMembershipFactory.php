<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\MembershipRole;
use App\Models\Academy;
use App\Models\AcademyMembership;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AcademyMembership>
 */
class AcademyMembershipFactory extends Factory
{
    protected $model = AcademyMembership::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'academy_id' => Academy::factory(),
            'role' => MembershipRole::Instructor,
            'joined_at' => now(),
            'revoked_at' => null,
        ];
    }

    public function owner(): self
    {
        return $this->state(['role' => MembershipRole::Owner]);
    }

    public function admin(): self
    {
        return $this->state(['role' => MembershipRole::Admin]);
    }

    public function instructor(): self
    {
        return $this->state(['role' => MembershipRole::Instructor]);
    }

    public function assistant(): self
    {
        return $this->state(['role' => MembershipRole::Assistant]);
    }

    public function revoked(): self
    {
        return $this->state(['revoked_at' => now()]);
    }
}
