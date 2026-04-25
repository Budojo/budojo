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

        $academy = $admin->academy;
        if ($academy === null) {
            $academy = Academy::create([
                'user_id' => $admin->id,
                'name' => 'Eagles BJJ',
                'slug' => 'eagles-bjj-' . Str::lower(Str::random(8)),
                'address' => 'Via Piana, 1, 06061 Castiglione del Lago PG',
            ]);
        } else {
            $academy->forceFill([
                'name' => 'Eagles BJJ',
                'address' => 'Via Piana, 1, 06061 Castiglione del Lago PG',
            ])->save();
        }

        $athletes = [
            [
                'first_name' => 'Matteo',
                'last_name' => 'Bonanno',
                'email' => 'matteobonanno1990@gmail.com',
                'date_of_birth' => '1990-09-09',
                'belt' => Belt::Black,
                'stripes' => 0,
            ],
            [
                'first_name' => 'Elyzabeth',
                'last_name' => 'Ayca',
                'date_of_birth' => '1982-08-19',
                'belt' => Belt::White,
                'stripes' => 4,
            ],
            [
                'first_name' => 'Isabella',
                'last_name' => 'Conciarelli',
                'belt' => Belt::Blue,
                'stripes' => 1,
            ],
            [
                'first_name' => 'Iacopo',
                'last_name' => 'Cherubini',
                'date_of_birth' => '1990-12-02',
                'belt' => Belt::Blue,
                'stripes' => 0,
            ],
            [
                'first_name' => 'Pedro',
                'last_name' => 'Engel',
                'date_of_birth' => '2007-09-10',
                'belt' => Belt::Blue,
                'stripes' => 0,
            ],
            [
                'first_name' => 'Thomas',
                'last_name' => 'Sanna',
                'date_of_birth' => '2009-12-15',
                'belt' => Belt::White,
                'stripes' => 2,
            ],
            [
                'first_name' => 'Dario',
                'last_name' => 'Ascanio',
                'belt' => Belt::Brown,
                'stripes' => 0,
            ],
            [
                'first_name' => 'Alessio',
                'last_name' => 'Montesi',
                'date_of_birth' => '1994-11-02',
                'belt' => Belt::Blue,
                'stripes' => 0,
            ],
            [
                'first_name' => 'Chiara',
                'last_name' => 'Ceccarelli',
                'date_of_birth' => '1994-04-11',
                'belt' => Belt::White,
                'stripes' => 0,
            ],
            [
                'first_name' => 'Francesco',
                'last_name' => 'Prestipino',
                'date_of_birth' => '2003-04-29',
                'belt' => Belt::White,
                'stripes' => 0,
            ],
            [
                'first_name' => 'Samuele',
                'last_name' => 'Bruni',
                'date_of_birth' => '2004-10-31',
                'belt' => Belt::White,
                'stripes' => 0,
            ],
            [
                'first_name' => 'Stefano',
                'last_name' => 'Santiccioli',
                'date_of_birth' => '1985-12-26',
                'belt' => Belt::White,
                'stripes' => 0,
            ],
        ];

        Athlete::withTrashed()->where('academy_id', $academy->id)->forceDelete();

        foreach ($athletes as $row) {
            Athlete::create([
                'academy_id' => $academy->id,
                'first_name' => $row['first_name'],
                'last_name' => $row['last_name'],
                'email' => $row['email'] ?? null,
                'phone' => null,
                'date_of_birth' => isset($row['date_of_birth']) ? Carbon::parse($row['date_of_birth']) : null,
                'belt' => $row['belt'],
                'stripes' => $row['stripes'],
                'status' => AthleteStatus::Active,
                'joined_at' => Carbon::today(),
            ]);
        }
    }
}
