<?php

declare(strict_types=1);

namespace App\Http\Requests\Stats;

use App\Authorization\Capability;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * What one athlete has seen of the programme (#1567).
 *
 * Gated on `attendance_read`, not on `stats_view`. The academy-wide coverage
 * report is an owner's view of the programme; this one lives on the athlete's
 * page beside their attendance, and anyone who can see who was there can see
 * what they saw. An instructor planning a private lesson is exactly the reader
 * this was written for.
 */
class AthleteSyllabusCoverageRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        $academyId = $user->activeAcademyId();
        if ($academyId === null || ! $user->canInAcademy($academyId, Capability::AttendanceRead)) {
            return false;
        }

        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            // Missing from the route: model binding 404s downstream, and a
            // 403 here would hide a wrong id behind a permissions answer.
            return true;
        }

        return $athlete->academy_id === $academyId;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Ten back is further than any academy's data goes, so the cap is
            // never the thing in the way. Mirrors the academy-wide report.
            'seasons_back' => ['sometimes', 'integer', 'min:0', 'max:10'],
        ];
    }

    public function seasonsBack(): int
    {
        return $this->has('seasons_back') ? $this->integer('seasons_back') : 0;
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
