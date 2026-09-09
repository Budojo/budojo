<?php

declare(strict_types=1);

namespace App\Http\Requests\Academy;

use App\Http\Requests\Concerns\ValidatesAddress;
use Illuminate\Foundation\Http\FormRequest;

class StoreAcademyRequest extends FormRequest
{
    use ValidatesAddress;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            // Carbon dayOfWeek convention (0=Sun..6=Sat). `null` / omitted =
            // "schedule not configured", which the daily check-in UI uses
            // as the signal to fall back to all-weekdays. `min:1` rejects
            // an empty array so the "not configured" state is canonically
            // `null` on the wire — `[]` would be an ambiguous third state
            // ("configured to zero days"? "cleared but didn't say so"?).
            'training_days' => ['sometimes', 'nullable', 'array', 'min:1', 'max:7'],
            'training_days.*' => ['integer', 'between:0,6', 'distinct'],
            // The month the training year restarts in (#1484). Nullable, and
            // null is not "no season" — it is "nobody has said", which
            // App\Support\Season answers with September. A season is not
            // optional the way a carnet is: every academy has one whether or
            // not it has an opinion about it.
            'season_start_month' => ['sometimes', 'nullable', 'integer', 'between:1,12'],
            ...$this->addressRules(),
        ];
    }
}
