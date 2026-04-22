<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Academy;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command->warn('AdminSeeder skipped — only runs in local/testing environments.');

            return;
        }

        $password = config('seeder.local_admin_password');

        if (! \is_string($password) || $password === '') {
            throw new \RuntimeException('LOCAL_ADMIN_PASSWORD must be set in .env before running AdminSeeder.');
        }

        $admin = User::firstOrCreate(['email' => 'admin@example.it'], ['name' => 'Admin Budojo', 'password' => Hash::make($password)]);

        if ($admin->wasRecentlyCreated) {
            $admin->forceFill([
                'email_verified_at' => now(),
                'remember_token' => Str::random(10),
            ])->save();
        }

        if ($admin->academy === null) {
            Academy::create([
                'user_id' => $admin->id,
                'name' => 'Budojo HQ',
                'slug' => 'budojo-hq-' . Str::lower(Str::random(8)),
                'address' => 'Via Roma 1, Milano',
            ]);
        }
    }
}
