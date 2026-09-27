<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Enums\AppLocale;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\Carnet;
use App\Support\Csv\CsvValue;
use App\Support\OperatorDay;
use App\Support\Season;
use Carbon\CarbonImmutable;

/**
 * A season of payments, as the accountant asks for it (#1762).
 *
 * Every fee and every carnet that came in during one academy season, oldest
 * first, in one list. Before this, getting the year's takings out of Budojo
 * meant reading the ledger off the screen a row at a time.
 *
 * **A season, not a calendar year.** The bounds are `Season::startFor` and
 * `endFor`, honouring the academy's `season_start_month`, because the ledger
 * already reads by season (#1709) and two definitions of "the year" in one
 * product is a bug waiting to be filed.
 *
 * **The day the money came in.** A fee is dated by `paid_at` (#1761), read on
 * the operator's day (#1963); a carnet by `purchased_at`. So a fee recorded
 * before #1761 at 23:30 UTC on 31 August is 1 September's money in Rome, and
 * this season's.
 *
 * **Every athlete, including one since deleted.** The money came in; removing
 * the athlete later does not un-collect it.
 *
 * Returns the rows rather than writing them, so the controller streams them
 * through `CsvWriter` and the file format lives in one place.
 */
final class ExportSeasonPaymentsAction
{
    /**
     * @return array{filename: string, header: list<string>, rows: list<list<string|int|null>>}
     */
    public function execute(Academy $academy, int $seasonStartYear, AppLocale $locale): array
    {
        $inSeason = CarbonImmutable::create($seasonStartYear, $academy->season_start_month ?? Season::DEFAULT_MONTH, 1);
        \assert($inSeason !== null);
        $start = Season::startFor($academy, $inSeason);
        $end = Season::endFor($academy, $inSeason);

        $lines = [...$this->fees($academy, $start, $end, $locale), ...$this->carnets($academy, $start, $end, $locale)];
        // Oldest first; on one day, fees before carnets, then in the order they were written.
        usort($lines, static fn (array $a, array $b): int => $a['order'] <=> $b['order']);

        return [
            'filename' => 'budojo-payments-' . str_replace('/', '-', Season::labelFor($academy, $inSeason)) . '.csv',
            'header' => $this->header($locale),
            'rows' => array_map(static fn (array $line): array => $line['cells'], $lines),
        ];
    }

    /**
     * @return list<array{order: array{string, int, int}, cells: list<string|int|null>}>
     */
    private function fees(Academy $academy, CarbonImmutable $start, CarbonImmutable $end, AppLocale $locale): array
    {
        $tz = OperatorDay::timezone();
        // The season's first and last operator days, as UTC instants: `paid_at`
        // holds either the start of a business day (UTC midnight) or, before
        // #1761, the moment it was recorded — both compare correctly here.
        $from = CarbonImmutable::parse($start->toDateString(), $tz)->utc();
        $until = CarbonImmutable::parse($end->addDay()->toDateString(), $tz)->utc();

        return array_values(AthletePayment::query()
            ->whereIn('athlete_id', $this->athleteIds($academy))
            ->where('paid_at', '>=', $from)
            ->where('paid_at', '<', $until)
            ->with(['athlete' => static fn ($q) => $q->withTrashed()])
            ->get()
            ->map(function (AthletePayment $payment) use ($tz, $locale): array {
                $day = CarbonImmutable::instance($payment->paid_at)->setTimezone($tz);
                $first = CarbonImmutable::create($payment->year, $payment->month, 1);
                \assert($first !== null);
                $last = $first->addMonths($payment->period_months->value - 1);
                $covers = $this->month($first, $locale)
                    . ($first->equalTo($last) ? '' : ' – ' . $this->month($last, $locale));

                return [
                    'order' => [$day->toDateString(), 0, $payment->id],
                    'cells' => [
                        CsvValue::date($day),
                        $this->label('type.fee', $locale),
                        $this->athleteName($payment->athlete),
                        CsvValue::money($payment->amount_cents),
                        MonthlyPaymentsStatsAction::CURRENCY,
                        $payment->period_months->value,
                        $payment->payment_method === null ? null : $this->label('method.' . $payment->payment_method->value, $locale),
                        $covers,
                        null,
                    ],
                ];
            })
            ->all());
    }

    /**
     * @return list<array{order: array{string, int, int}, cells: list<string|int|null>}>
     */
    private function carnets(Academy $academy, CarbonImmutable $start, CarbonImmutable $end, AppLocale $locale): array
    {
        return array_values(Carnet::query()
            ->whereIn('athlete_id', $this->athleteIds($academy))
            ->whereDate('purchased_at', '>=', $start->toDateString())
            ->whereDate('purchased_at', '<=', $end->toDateString())
            ->with(['athlete' => static fn ($q) => $q->withTrashed()])
            ->get()
            ->map(function (Carnet $carnet) use ($locale): array {
                $validFrom = $carnet->valid_from ?? $carnet->purchased_at;

                return [
                    'order' => [$carnet->purchased_at->toDateString(), 1, $carnet->id],
                    'cells' => [
                        CsvValue::date($carnet->purchased_at),
                        $this->label('type.carnet', $locale),
                        $this->athleteName($carnet->athlete),
                        CsvValue::money($carnet->price_cents),
                        MonthlyPaymentsStatsAction::CURRENCY,
                        $carnet->total_entries,
                        $carnet->payment_method === null ? null : $this->label('method.' . $carnet->payment_method->value, $locale),
                        CsvValue::date($validFrom) . ' – ' . CsvValue::date($carnet->expires_at),
                        $carnet->code,
                    ],
                ];
            })
            ->all());
    }

    /**
     * Every athlete the academy ever had, the deleted ones included.
     *
     * @return \Illuminate\Database\Eloquent\Builder<Athlete>
     */
    private function athleteIds(Academy $academy): \Illuminate\Database\Eloquent\Builder
    {
        return Athlete::withTrashed()->where('academy_id', $academy->id)->select('id');
    }

    /**
     * @return list<string>
     */
    private function header(AppLocale $locale): array
    {
        return array_map(
            fn (string $column): string => $this->label('header.' . $column, $locale),
            ['date', 'type', 'athlete', 'amount', 'currency', 'period_or_entries', 'method', 'covers', 'code'],
        );
    }

    /** `set 2026`: a month in words, so Excel never takes it for a date. */
    private function month(CarbonImmutable $month, AppLocale $locale): string
    {
        $localized = $month->locale($locale->value);
        \assert($localized instanceof CarbonImmutable);

        return $localized->translatedFormat('M Y');
    }

    private function athleteName(?Athlete $athlete): string
    {
        return $athlete === null ? '' : "{$athlete->last_name} {$athlete->first_name}";
    }

    private function label(string $key, AppLocale $locale): string
    {
        $text = __('payments_export.' . $key, [], $locale->value);

        return \is_string($text) ? $text : $key;
    }
}
