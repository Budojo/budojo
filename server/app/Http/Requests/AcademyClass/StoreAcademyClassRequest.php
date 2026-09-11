<?php

declare(strict_types=1);

namespace App\Http\Requests\AcademyClass;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ValidatesAcademyClass;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class StoreAcademyClassRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ValidatesAcademyClass;

    /**
     * The timetable is academy configuration, gated like the price list and
     * the training days: whoever may change the academy's settings may change
     * when it trains. An instructor who records attendance does not thereby
     * get to move the class they teach.
     */
    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AcademySettingsUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return $this->academyClassRules(required: true);
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
