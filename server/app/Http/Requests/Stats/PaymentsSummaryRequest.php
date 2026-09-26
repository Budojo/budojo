<?php

declare(strict_types=1);

namespace App\Http\Requests\Stats;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * `?year=&month=` for the money summary (#1758). Both or neither: neither is
 * the current month, and one without the other is a mistake, not a default.
 */
class PaymentsSummaryRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::StatsView);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'year' => ['required_with:month', 'integer', 'min:2000', 'max:2100'],
            'month' => ['required_with:year', 'integer', 'min:1', 'max:12'],
        ];
    }

    public function year(): int
    {
        return $this->has('year') ? $this->integer('year') : CarbonImmutable::today()->year;
    }

    public function month(): int
    {
        return $this->has('month') ? $this->integer('month') : CarbonImmutable::today()->month;
    }

    /** The same JSON 403 envelope as every other `/stats/*` request. */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
