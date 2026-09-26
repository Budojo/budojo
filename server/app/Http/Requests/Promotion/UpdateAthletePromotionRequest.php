<?php

declare(strict_types=1);

namespace App\Http\Requests\Promotion;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\Athlete;
use App\Support\OperatorDay;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class UpdateAthletePromotionRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    /**
     * Correcting a promotion's date is an athlete-record edit — gated by
     * the same capability as any other athlete write, not a lesser tier
     * borrowed from the read-only history endpoint.
     */
    public function authorize(): bool
    {
        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            return false;
        }

        return $this->authorizeInAcademy($athlete->academy_id, Capability::AthletesCreateUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // The only editable field (#1431 PR 1 of 2). `kind`, the belt/
            // stripe transition, and who recorded it describe the event
            // itself and aren't in scope for a date correction. Date-only,
            // matching the timeline's display precision (`mediumDate`) — a
            // promotion can't be recorded ahead of today.
            'recorded_at' => ['required', 'date_format:Y-m-d', OperatorDay::notAfterToday()],
        ];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
