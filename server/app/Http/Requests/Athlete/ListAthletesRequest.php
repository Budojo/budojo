<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Support\OperatorDay;
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
     * starts from. Without it the window starts from the owner's day
     * (`OperatorDay`, #1963), which the server no longer mistakes for UTC's —
     * but the browser's day is still the better answer for someone reading
     * from another timezone, so the caller may say which day it is, within a
     * day either way of the owner's: no time zone is further than that, and
     * no wider bound turns the filter into a query of any window at all.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $today = OperatorDay::today();

        return [
            'from' => [
                'sometimes',
                'date_format:Y-m-d',
                'after_or_equal:' . $today->subDay()->toDateString(),
                'before_or_equal:' . $today->addDay()->toDateString(),
            ],
        ];
    }

    /** The day a birthday window starts from: the caller's, or the owner's. */
    public function birthdayFrom(): CarbonImmutable
    {
        $value = $this->validated('from');
        $from = \is_string($value) ? CarbonImmutable::createFromFormat('!Y-m-d', $value) : null;

        return $from instanceof CarbonImmutable ? $from : OperatorDay::today();
    }
}
