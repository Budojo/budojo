<?php

declare(strict_types=1);

namespace App\Http\Requests\Promotion;

use App\Authorization\Capability;
use App\Enums\Belt;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ResolvesRankLadder;
use App\Models\Athlete;
use App\Rules\BeltInLadder;
use App\Rules\StripesWithinGrade;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

/**
 * "Saltato" on a ghost row (#1966): a grade this athlete never reached by the
 * step the timeline was offering. Judged against the academy's ladder like
 * every other belt that comes in — a skip on a grade that does not exist
 * would hide nothing and mean nothing.
 */
class StorePromotionSkipRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ResolvesRankLadder;

    public function authorize(): bool
    {
        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            return false;
        }

        return $this->authorizeInAcademy($athlete->academy_id, Capability::AthletesCreateUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'belt' => ['required', Rule::enum(Belt::class), new BeltInLadder($this->rankLadder())],
            'stripes' => ['required', 'integer', 'min:0', 'max:10', new StripesWithinGrade($this->rankLadder())],
        ];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
