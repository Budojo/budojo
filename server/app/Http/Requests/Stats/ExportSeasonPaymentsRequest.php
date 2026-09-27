<?php

declare(strict_types=1);

namespace App\Http\Requests\Stats;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\Academy;
use App\Support\OperatorDay;
use App\Support\Season;
use Illuminate\Foundation\Http\FormRequest;

/**
 * `?season=YYYY` for the accountant's file (#1762): the year the season
 * starts in, so `2026` is 2026/27 in a September-start academy. Omitted, it
 * is the season the owner is in today.
 */
class ExportSeasonPaymentsRequest extends FormRequest
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
            'season' => ['sometimes', 'integer', 'min:2000', 'max:2100'],
        ];
    }

    public function seasonStartYear(Academy $academy): int
    {
        return $this->has('season')
            ? $this->integer('season')
            : Season::startFor($academy, OperatorDay::today())->year;
    }
}
