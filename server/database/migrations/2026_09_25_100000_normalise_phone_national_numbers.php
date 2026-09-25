<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumber;
use libphonenumber\PhoneNumberUtil;

/**
 * Puts the phone numbers already on disk into the shape every write now
 * stores (#1867), where that is safe: the national **significant** number
 * beside the dial code.
 *
 * **Rewritten: a valid number with a trunk zero.** `+44` / `07911123456` was
 * stored as typed on the form, and WhatsApp refuses `wa.me/4407911123456`. A
 * number that is valid as stored and whose significant number differs is
 * rewritten to it (`7911123456`): the same number, in the right shape.
 *
 * **Not rewritten: an Italian landline without its zero.** The CSV import,
 * and the #75 migration that split the old single phone column, both took
 * libphonenumber's national number, which drops that zero: `06 1234567` was
 * stored as `61234567`. Putting a `0` back is not safe. libphonenumber takes
 * almost any `0` + 6 to 11 digits for an Italian landline, and the import
 * stored its values unchecked, so a junk `123456` would become a plausible
 * stranger's number that the form then accepts in silence. A number that is
 * wrong and looks wrong (a 422 on edit, a WhatsApp link that fails) is better
 * than one that is wrong and looks right. Those rows are **named in the log**
 * for a person to check instead: every `+39` number still invalid once this
 * has run.
 *
 * Anything else is left alone. Athletes (soft-deleted included, so a restore
 * comes back right) and academies both carry the pair.
 *
 * **What it did goes to the log, without the numbers.** A phone number is
 * personal data (`PiiRedactor` lists the column), so each line names the row
 * and keeps the last three digits: one line per rewrite, a closing count, and
 * a warning listing the Italian numbers still invalid.
 *
 * Self-contained on purpose: a migration must still do what it did the day it
 * ran, so it calls libphonenumber directly rather than the app's own
 * `PhonePair`, which may change. Idempotent: a second run finds every row in
 * shape.
 */
return new class extends Migration
{
    private const array TABLES = ['athletes', 'academies'];

    public function up(): void
    {
        $changed = 0;
        foreach (self::TABLES as $table) {
            $changed += $this->normalise($table);
        }

        Log::info('phone numbers checked against their national significant number (#1867)', [
            'changed' => $changed,
        ]);

        $invalid = $this->italianStillInvalid();
        if ($invalid !== []) {
            Log::warning('Italian phone numbers still invalid after #1867, to check by hand', [
                'count' => \count($invalid),
                'rows' => $invalid,
            ]);
        }
    }

    /**
     * Nothing to undo: the old values were wrong, and putting a trunk zero
     * back would break the links again.
     */
    public function down(): void
    {
    }

    private function normalise(string $table): int
    {
        $changed = 0;

        $this->eachPhone($table, function (object $row, string $countryCode, string $national) use ($table, &$changed): void {
            $fixed = $this->fix($countryCode, $national);
            if ($fixed === null) {
                return;
            }

            DB::table($table)->where('id', $row->id)->update(['phone_national_number' => $fixed['number']]);
            $changed++;
            Log::info('phone number normalised (#1867)', [
                'table' => $table,
                'id' => $row->id,
                'fix' => $fixed['fix'],
                'ends_with' => substr($fixed['number'], -3),
            ]);
        });

        return $changed;
    }

    /**
     * Every `+39` pair that is not a valid number, by row and last three
     * digits: most of them, an imported landline without its zero.
     *
     * @return list<array{table: string, id: mixed, ends_with: string}>
     */
    private function italianStillInvalid(): array
    {
        $util = PhoneNumberUtil::getInstance();
        $invalid = [];
        foreach (self::TABLES as $table) {
            $this->eachPhone($table, function (object $row, string $countryCode, string $national) use ($util, $table, &$invalid): void {
                if ($countryCode !== '+39') {
                    return;
                }
                $number = $this->parse($util, $countryCode . $national);
                if ($number === null || ! $util->isValidNumber($number)) {
                    $invalid[] = ['table' => $table, 'id' => $row->id, 'ends_with' => substr($national, -3)];
                }
            });
        }

        return $invalid;
    }

    /**
     * Visits every row of the table that carries a phone pair.
     *
     * @param \Closure(object, string, string): void $visit
     */
    private function eachPhone(string $table, \Closure $visit): void
    {
        DB::table($table)
            ->whereNotNull('phone_country_code')
            ->whereNotNull('phone_national_number')
            ->orderBy('id')
            ->select('id', 'phone_country_code', 'phone_national_number')
            ->chunk(500, function ($rows) use ($visit): void {
                foreach ($rows as $row) {
                    $visit(
                        $row,
                        \is_string($row->phone_country_code) ? $row->phone_country_code : '',
                        \is_string($row->phone_national_number) ? $row->phone_national_number : '',
                    );
                }
            });
    }

    /**
     * The significant number of a pair that is valid as stored and differs
     * from it; null for everything else, which this migration leaves alone.
     *
     * @return array{number: string, fix: string}|null
     */
    private function fix(string $countryCode, string $national): ?array
    {
        if ($countryCode === '' || ! ctype_digit($national)) {
            return null;
        }

        $util = PhoneNumberUtil::getInstance();
        $number = $this->parse($util, $countryCode . $national);
        if ($number === null || ! $util->isValidNumber($number)) {
            return null;
        }

        $significant = $util->getNationalSignificantNumber($number);
        if ($significant === $national) {
            return null;
        }

        return [
            'number' => $significant,
            'fix' => '0' . $significant === $national
                ? 'dropped a trunk zero'
                : 'rewrote to the national significant number',
        ];
    }

    private function parse(PhoneNumberUtil $util, string $e164): ?PhoneNumber
    {
        try {
            return $util->parse($e164, null);
        } catch (NumberParseException) {
            return null;
        }
    }
};
