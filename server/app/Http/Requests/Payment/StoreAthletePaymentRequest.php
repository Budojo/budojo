<?php

declare(strict_types=1);

namespace App\Http\Requests\Payment;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\Athlete;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class StoreAthletePaymentRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    /**
     * Capability gate (`PaymentsMarkPaid` in the athlete's academy).
     * The `{athlete}` route parameter is resolved by Laravel's implicit
     * route-model binding before this fires; the capability check
     * runs against the athlete's academy, not the caller's active
     * academy — so switching active academy doesn't accidentally allow
     * cross-tenant writes. Failed authorization returns 403 with the
     * canonical `{"message":"Forbidden."}` envelope.
     */
    public function authorize(): bool
    {
        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            return false;
        }

        return $this->authorizeInAcademy($athlete->academy_id, Capability::PaymentsMarkPaid);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Year window is generous on the future side (advance payments are
            // a real use case) and reasonable on the past side (no point
            // recording a payment from before this app existed).
            'year' => ['required', 'integer', 'min:2020', 'max:2100'],
            'month' => ['required', 'integer', 'between:1,12'],
        ];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
