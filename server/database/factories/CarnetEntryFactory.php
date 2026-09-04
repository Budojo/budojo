<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\AttendanceRecord;
use App\Models\Carnet;
use App\Models\CarnetEntry;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CarnetEntry>
 */
class CarnetEntryFactory extends Factory
{
    protected $model = CarnetEntry::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'carnet_id' => Carnet::factory(),
            'attendance_record_id' => AttendanceRecord::factory(),
            'used_on' => now()->toDateString(),
        ];
    }
}
