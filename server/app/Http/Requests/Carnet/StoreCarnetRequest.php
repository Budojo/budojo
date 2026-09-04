<?php

declare(strict_types=1);

namespace App\Http\Requests\Carnet;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\Athlete;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class StoreCarnetRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    /**
     * Selling a carnet is gated by `PaymentsMarkPaid` rather than a
     * carnet-specific capability: it is the same act of trust as marking a
     * month paid — front-desk staff taking money at the counter — and the
     * capability matrix is deliberately coarse-grained (adding a case means
     * touching every role row plus the PRD).
     *
     * The check runs against the athlete's academy, not the caller's active
     * one, so switching active academy can't authorise a cross-tenant write.
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
            // Back-dating is the point — the owner transcribes a sale from the
            // paper register. A carnet that starts in the future is not a
            // thing: validity runs from the purchase date.
            //
            // `date_format` rather than `date`: the bare rule accepts anything
            // strtotime can chew, so `03/04/2026` would be silently parsed as
            // one of two different days and a zoned datetime could land on the
            // neighbouring date. The OpenAPI declares `format: date`; this is
            // the rule that actually holds us to it.
            'purchased_at' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'before_or_equal:today'],
        ];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
