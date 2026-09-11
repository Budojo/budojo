<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\ClassKind;
use Illuminate\Validation\Rule;

/**
 * The shape of a timetable slot (#1562), shared by the store and update
 * requests so the two cannot drift the first time a bound moves.
 */
trait ValidatesAcademyClass
{
    /**
     * @return array<string, mixed>
     */
    protected function academyClassRules(bool $required): array
    {
        $presence = $required ? 'required' : 'sometimes';

        return [
            'name' => [$presence, 'string', 'max:60'],
            // Carbon dayOfWeek: Sunday is 0, Saturday is 6.
            'weekday' => [$presence, 'integer', 'between:0,6'],
            // `HH:MM`, 24-hour, and nothing else — it is stored as text and
            // sorted as text, so a stray `7:00 PM` would land after `19:00`.
            'starts_at' => ['sometimes', 'nullable', 'date_format:H:i'],
            // A quarter of an hour to eight hours. The ceiling catches a
            // duration typed in seconds, not a rule about how long people train.
            'duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:15', 'max:480'],
            'kind' => [$presence, Rule::enum(ClassKind::class)],
        ];
    }
}
