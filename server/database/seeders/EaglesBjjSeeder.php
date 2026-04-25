<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class EaglesBjjSeeder extends Seeder
{
    /**
     * @return array{
     *   academy: array{name: string, address: string},
     *   athletes: list<array{
     *     first_name: string,
     *     last_name: string,
     *     email: string|null,
     *     date_of_birth: string|null,
     *     belt: string,
     *     stripes: int,
     *     joined_at: string|null,
     *     attendance_probability: float|null
     *   }>,
     *   attendance: array{
     *     training_days_of_week: list<int>,
     *     simulation_window_days: int,
     *     default_probability: float
     *   }
     * }
     */
    public static function fixture(): array
    {
        $base = database_path('seed-data/eagles-bjj');
        $path = is_file("{$base}.local.php") ? "{$base}.local.php" : "{$base}.example.php";

        /**
         * @var array{
         *   academy: array{name: string, address: string},
         *   athletes: list<array{
         *     first_name: string,
         *     last_name: string,
         *     email: string|null,
         *     date_of_birth: string|null,
         *     belt: string,
         *     stripes: int,
         *     joined_at: string|null,
         *     attendance_probability: float|null
         *   }>,
         *   attendance: array{
         *     training_days_of_week: list<int>,
         *     simulation_window_days: int,
         *     default_probability: float
         *   }
         * } $data
         */
        $data = require $path;

        return $data;
    }

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command->warn('EaglesBjjSeeder skipped — only runs in local/testing environments.');

            return;
        }

        $admin = User::where('email', 'admin@example.it')->first();
        if ($admin === null) {
            throw new \RuntimeException('EaglesBjjSeeder requires the admin user — run AdminSeeder first.');
        }

        $data = self::fixture();

        $academy = $admin->academy;
        if ($academy === null) {
            $academy = Academy::create([
                'user_id' => $admin->id,
                'name' => $data['academy']['name'],
                'slug' => Str::slug($data['academy']['name']) . '-' . Str::lower(Str::random(8)),
                'address' => $data['academy']['address'],
            ]);
        } else {
            $academy->forceFill([
                'name' => $data['academy']['name'],
                'address' => $data['academy']['address'],
            ])->save();
        }

        Athlete::withTrashed()
            ->where('academy_id', $academy->id)
            ->lazyById()
            ->each(fn (Athlete $athlete) => $athlete->forceDelete());

        foreach ($data['athletes'] as $row) {
            Athlete::create([
                'academy_id' => $academy->id,
                'first_name' => $row['first_name'],
                'last_name' => $row['last_name'],
                'email' => $row['email'],
                'phone' => null,
                'date_of_birth' => $row['date_of_birth'] !== null ? Carbon::parse($row['date_of_birth']) : null,
                'belt' => Belt::from($row['belt']),
                'stripes' => $row['stripes'],
                'status' => AthleteStatus::Active,
                'joined_at' => $row['joined_at'] !== null
                    ? Carbon::parse($row['joined_at'])
                    : Carbon::today()->subDays(random_int(180, 720)),
            ]);
        }
    }
}
