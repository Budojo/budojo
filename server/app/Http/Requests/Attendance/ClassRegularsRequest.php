<?php

declare(strict_types=1);

namespace App\Http\Requests\Attendance;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * The regulars of one class, as of one evening (#1730). Read wherever
 * attendance is: it is asked from the check-in, by whoever is holding it.
 */
class ClassRegularsRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AttendanceRead);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'date' => ['required', 'date_format:Y-m-d'],
            // No `exists` rule: a class that is not this academy's is one
            // Forbidden, answered by the controller like the check-in's own,
            // so the answer never says which ids exist somewhere else.
            'academy_class_id' => ['required', 'integer'],
        ];
    }

    public function day(): CarbonImmutable
    {
        return CarbonImmutable::parse($this->string('date')->toString())->startOfDay();
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
