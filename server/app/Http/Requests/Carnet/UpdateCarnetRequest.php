<?php

declare(strict_types=1);

namespace App\Http\Requests\Carnet;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\Athlete;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class UpdateCarnetRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    /**
     * Re-dating a carnet moves money around — it changes which sessions the
     * athlete has paid for — so it is gated by the same capability as selling
     * one, not by the weaker read permission.
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
            // The only editable field. Price, size and code are snapshots of
            // the sale and stay untouchable; the expiry is derived, not given.
            'valid_from' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
        ];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
