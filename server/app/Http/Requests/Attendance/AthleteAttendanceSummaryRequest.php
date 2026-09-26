<?php

declare(strict_types=1);

namespace App\Http\Requests\Attendance;

use App\Models\Athlete;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

class AthleteAttendanceSummaryRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            // Athlete missing from the route → model binding will 404 in
            // the controller layer. Authorization defers to that path.
            return true;
        }

        return $user->activeAcademyId() !== null
            && $athlete->academy_id === $user->activeAcademyId();
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'range' => ['nullable', 'integer', 'in:30,90,365'],
            // A calendar month instead of the last N days (#1769): the
            // attendance tab's ring asks the same question over the month
            // it shows. One or the other, never both.
            'month' => ['nullable', 'string', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/', 'prohibits:range'],
        ];
    }

    /** The first day of the month asked for, or null when a range was. */
    public function month(): ?CarbonImmutable
    {
        $month = $this->validated('month');
        if (! \is_string($month)) {
            return null;
        }
        // `!` zeroes the unparsed fields, so the day is the 1st, not today's.
        $first = CarbonImmutable::createFromFormat('!Y-m', $month);

        return $first instanceof CarbonImmutable ? $first : null;
    }

    /** The last N days asked for; 90 when neither a range nor a month was. */
    public function rangeDays(): int
    {
        $range = $this->validated('range');

        return is_numeric($range) ? (int) $range : 90;
    }
}
