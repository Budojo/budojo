<?php

declare(strict_types=1);

namespace App\Http\Requests\Attendance;

use App\Models\Athlete;
use App\Models\User;
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
        ];
    }
}
