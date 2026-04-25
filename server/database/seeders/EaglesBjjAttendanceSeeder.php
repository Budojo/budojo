<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class EaglesBjjAttendanceSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command->warn('EaglesBjjAttendanceSeeder skipped — only runs in local/testing environments.');

            return;
        }

        $admin = User::where('email', 'admin@example.it')->first();
        $academy = $admin?->academy;
        if ($academy === null) {
            throw new \RuntimeException('EaglesBjjAttendanceSeeder requires the admin academy — run AdminSeeder + EaglesBjjSeeder first.');
        }

        $data = EaglesBjjSeeder::fixture();
        $defaultProbability = $data['attendance']['default_probability'];
        $trainingDays = $data['attendance']['training_days_of_week'];

        $probabilities = [];
        foreach ($data['athletes'] as $row) {
            $key = "{$row['first_name']} {$row['last_name']}";
            $probabilities[$key] = $row['attendance_probability'] ?? $defaultProbability;
        }

        $athletes = Athlete::where('academy_id', $academy->id)->get();

        AttendanceRecord::whereIn('athlete_id', $athletes->pluck('id'))
            ->withTrashed()
            ->forceDelete();

        $today = Carbon::today();
        $start = $today->copy()->subDays($data['attendance']['simulation_window_days']);
        $now = Carbon::now();
        $rows = [];

        foreach (self::eachTrainingDay($start, $today, $trainingDays) as $date) {
            foreach ($athletes as $athlete) {
                if ($athlete->joined_at->gt($date)) {
                    continue;
                }

                $key = "{$athlete->first_name} {$athlete->last_name}";
                $probability = $probabilities[$key] ?? $defaultProbability;

                if (! self::draw($probability)) {
                    continue;
                }

                $rows[] = [
                    'athlete_id' => $athlete->id,
                    'attended_on' => $date->toDateString(),
                    'notes' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            AttendanceRecord::insert($chunk);
        }
    }

    /**
     * @param  list<int>  $trainingDays
     * @return iterable<Carbon>
     */
    private static function eachTrainingDay(Carbon $start, Carbon $end, array $trainingDays): iterable
    {
        for ($date = $start->copy(); $date->lte($end); $date->addDay()) {
            if (\in_array($date->dayOfWeek, $trainingDays, true)) {
                yield $date->copy();
            }
        }
    }

    private static function draw(float $probability): bool
    {
        return random_int(0, 9999) < (int) round($probability * 10000);
    }
}
