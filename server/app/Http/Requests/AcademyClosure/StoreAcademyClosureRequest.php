<?php

declare(strict_types=1);

namespace App\Http\Requests\AcademyClosure;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * A closure (#1766). Gated like the timetable: whoever may change when the
 * academy trains may say when it is shut.
 */
class StoreAcademyClosureRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AcademySettingsUpdate);
    }

    /**
     * Both dates every time, on create and on edit: the dialog sends the
     * range whole, and `ends_on` is only meaningful against its `starts_on`.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'starts_on' => ['required', 'date_format:Y-m-d'],
            'ends_on' => ['required', 'date_format:Y-m-d', 'after_or_equal:starts_on'],
            'label' => ['nullable', 'string', 'max:80'],
        ];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
