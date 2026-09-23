<?php

declare(strict_types=1);

namespace App\Http\Requests\Academy;

use App\Enums\MartialArt;
use App\Http\Requests\Concerns\ValidatesAddress;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
            // What the academy teaches (#1800). Required, never defaulted: the
            // column's `bjj` default is for rows that predate it, and a request
            // that could omit this would let a setup screen ship without asking.
            'martial_art' => ['required', Rule::enum(MartialArt::class)],
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
            // The month fees start being recorded here (#1742). A date, taken
            // as given and pinned to the 1st by the Action — the form offers a
            // month, and a floor that moved with the day it was set would be a
            // different rule on the 15th than on the 1st.
            //
            // Never in the future. "Fees are recorded here from next October"
            // is not a statement anyone can act on, and it desynchronises the
            // ledger from everything else that decides unpaid: the roster's
            // `?paid=no`, the owner digest and the athlete overdue push all
            // answer for the CURRENT month without a floor, so a future one
            // would blank a month in the ledger while those three still chased
            // it. The rule lives here, once, rather than in four consumers —
            // and deliberately NOT in the picker, where a `maxDate` silently
            // blanked an already-stored future value instead of showing it.
            'billing_from' => ['sometimes', 'nullable', 'date', 'before_or_equal:today'],
            ...$this->addressRules(),
        ];
    }
}
