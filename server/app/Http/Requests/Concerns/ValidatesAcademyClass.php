<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\MartialArt;
use App\Enums\TrainingMode;
use App\Support\MartialArt\MartialArtProfile;
use Illuminate\Validation\Rule;

/**
 * The shape of a timetable slot (#1562), shared by the store and update
 * requests so the two cannot drift the first time a bound moves.
 *
 * `kind` is one of the academy's own training modes (#1803): a `gi` class in
 * a karate academy is a 422, not a row no picker there can show.
 */
trait ValidatesAcademyClass
{
    /**
     * @return array<string, mixed>
     */
    protected function academyClassRules(bool $required, MartialArt $art): array
    {
        $modes = array_map(static fn (TrainingMode $mode): string => $mode->value, MartialArtProfile::for($art)->classModes());

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
            'kind' => [$presence, 'string', Rule::in($modes)],
        ];
    }
}
