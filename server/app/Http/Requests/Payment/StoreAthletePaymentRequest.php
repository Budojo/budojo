<?php

declare(strict_types=1);

namespace App\Http\Requests\Payment;

use App\Models\Athlete;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class StoreAthletePaymentRequest extends FormRequest
{
    /**
     * Cross-academy ownership gate. The `{athlete}` route parameter is
     * resolved by Laravel's implicit route-model binding before this fires;
     * we just verify the athlete belongs to the caller's academy. Failed
     * authorization returns 403 with the canonical `{"message":"Forbidden."}`
     * envelope (see `failedAuthorization()` below).
     */
    public function authorize(): bool
    {
        $user = $this->user();
        if ($user === null || $user->academy === null) {
            return false;
        }

        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            return false;
        }

        return $athlete->academy_id === $user->academy->id;
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
