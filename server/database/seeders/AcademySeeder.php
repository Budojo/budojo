<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Academy;
use App\Models\User;
use Illuminate\Database\Seeder;

class AcademySeeder extends Seeder
{
    /**
     * Creates 5 users with an academy and 3 users without one
     * (to test the first-login /setup flow).
     */
    public function run(): void
    {
        // Users that already completed setup
        User::factory(5)
            ->has(Academy::factory())
            ->create();

        // Users that still need to set up their academy
        User::factory(3)->create();
    }
}
