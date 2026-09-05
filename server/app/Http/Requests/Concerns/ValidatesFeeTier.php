<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Models\AcademyFeeTier;
use Illuminate\Validation\Rule;

/**
 * The shape of a price-list line (#1381), shared by the store and update
 * requests. The two differ only in whether a field must be present, so the
 * rules live here rather than being written twice and drifting apart the
 * first time a bound moves.
 */
trait ValidatesFeeTier
{
    /**
     * @return array<string, mixed>
     */
    protected function feeTierRules(?int $academyId, bool $required): array
    {
        $presence = $required ? 'required' : 'sometimes';
        $tier = $this->route('tier');

        return [
            'label' => [
                $presence, 'string', 'max:60',
                // Two tiers with the same name at different prices is a
                // mistake, not a use case — and the owner reads the label to
                // pick one, so it has to identify.
                Rule::unique('academy_fee_tiers', 'label')
                    ->where('academy_id', $academyId)
                    ->ignore($tier instanceof AcademyFeeTier ? $tier : null),
            ],
            // Zero is allowed: an academy may well list a free tier, and
            // refusing it would push the owner back to a workaround.
            'amount_cents' => [$presence, 'integer', 'min:0'],
            // A week has seven days and nobody trains twice a day on all of
            // them; the ceiling is here to catch a fat finger, not to model a
            // rule.
            'lessons_per_week' => [$presence, 'integer', 'min:1', 'max:14'],
        ];
    }
}
