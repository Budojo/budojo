<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class EaglesBjjAttendanceSeeder extends Seeder
{
    /** @var array<string, float> */
    private const ATTENDANCE_PROBABILITY = [
        'Matteo Bonanno' => 1.0,
        'Iacopo Cherubini' => 0.9,
        'Pedro Engel' => 0.95,
    ];

    private const DEFAULT_PROBABILITY = 0.6;

    private const TRAINING_DAYS_OF_WEEK = [
        Carbon::TUESDAY,
        Carbon::THURSDAY,
        Carbon::SATURDAY,
    ];

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command->warn('EaglesBjjAttendanceSeeder skipped — only runs in local/testing environments.');

            return;
        }

        $academy = Academy::where('name', 'Eagles BJJ')->first();
        if ($academy === null) {
            throw new \RuntimeException('EaglesBjjAttendanceSeeder requires Eagles BJJ — run EaglesBjjSeeder first.');
        }

        $athletes = Athlete::where('academy_id', $academy->id)->get();

        AttendanceRecord::whereIn('athlete_id', $athletes->pluck('id'))
            ->withTrashed()
            ->forceDelete();

        $today = Carbon::today();
        $start = $today->copy()->subYear();

        $rows = [];
        $now = Carbon::now();

        foreach (self::eachTrainingDay($start, $today) as $date) {
            foreach ($athletes as $athlete) {
                if ($athlete->joined_at->gt($date)) {
                    continue;
                }

                $key = "{$athlete->first_name} {$athlete->last_name}";
                $probability = self::ATTENDANCE_PROBABILITY[$key] ?? self::DEFAULT_PROBABILITY;

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
     * @return iterable<Carbon>
     */
    private static function eachTrainingDay(Carbon $start, Carbon $end): iterable
    {
        for ($date = $start->copy(); $date->lte($end); $date->addDay()) {
            if (\in_array($date->dayOfWeek, self::TRAINING_DAYS_OF_WEEK, true)) {
                yield $date->copy();
            }
        }
    }

    private static function draw(float $probability): bool
    {
        return random_int(0, 9999) < (int) round($probability * 10000);
    }
}
