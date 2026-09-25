<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

/**
 * The roster index. Its filters stay forgiving — an unknown `paid`,
 * `birthday` or `sort_by` applies no filter rather than refusing the list
 * (see `AthleteController::index`) — so this validates the one parameter
 * that must be exact.
 */
class ListAthletesRequest extends FormRequest
{
    /** The academy check is the controller's, with the index's own 403 body. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * `from` (#1754): the caller's own calendar day, which the birthday window
     * starts from. The server runs on UTC, and near midnight the owner's day
     * is a day away from it — a window built from the server's day can drop
     * a birthday on the owner's seventh day, and a client can only remove
     * rows from an answer, never add them. So the caller says which day it
     * is, within a day either way of the server's: no time zone is further
     * than that, and no wider bound turns the filter into a query of any
     * window at all.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $today = CarbonImmutable::today();

        return [
            'from' => [
                'sometimes',
                'date_format:Y-m-d',
                'after_or_equal:' . $today->subDay()->toDateString(),
                'before_or_equal:' . $today->addDay()->toDateString(),
            ],
        ];
    }

    /** The day a birthday window starts from: the caller's, or the server's. */
    public function birthdayFrom(): CarbonImmutable
    {
        $value = $this->validated('from');
        $from = \is_string($value) ? CarbonImmutable::createFromFormat('!Y-m-d', $value) : null;

        return $from instanceof CarbonImmutable ? $from : CarbonImmutable::today();
    }
}
