<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\TopicKind;
use App\Models\Academy;
use App\Models\SyllabusTopic;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SyllabusTopic>
 */
class SyllabusTopicFactory extends Factory
{
    protected $model = SyllabusTopic::class;

    /**
     * A position by default; `under()` makes a technique.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'academy_id' => Academy::factory(),
            'parent_id' => null,
            // Unbounded, not a curated list: `unique()` buckets by generator
            // method, so a fixed set of names caps how many topics one test
            // may create — and `definition()` runs even when the caller
            // passes a name of its own, which almost every test does.
            'name' => ucfirst($this->faker->unique()->words(2, true)),
            'kind' => TopicKind::Both,
            'in_season' => true,
            'sort_order' => 0,
        ];
    }

    /** A technique under the given position, in that position's academy. */
    public function under(SyllabusTopic $position): static
    {
        return $this->state([
            'academy_id' => $position->academy_id,
            'parent_id' => $position->id,
        ]);
    }
}
