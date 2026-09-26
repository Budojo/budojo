<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Academy;
use App\Models\AcademyClosure;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AcademyClosure>
 */
class AcademyClosureFactory extends Factory
{
    protected $model = AcademyClosure::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'academy_id' => Academy::factory(),
            'starts_on' => '2026-08-10',
            'ends_on' => '2026-08-25',
            'label' => 'Chiusura estiva',
        ];
    }
}
