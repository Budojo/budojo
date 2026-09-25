<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberUtil;

/**
 * Puts the phone numbers already on disk into the shape every write now
 * stores (#1867): the national **significant** number beside the dial code.
 *
 * Two kinds of row are wrong, each from one path:
 *
 * - **A trunk zero typed on the form.** `+44` / `07911123456` was stored as
 *   typed; WhatsApp refuses `wa.me/4407911123456`. Rewritten to `7911123456`.
 * - **An Italian landline through the CSV import.** The import took
 *   libphonenumber's national number, which drops the leading zero, so
 *   `06 1234567` was stored as `61234567` — a different line. The import ran
 *   no reachability check, so these rows got in although they are not valid
 *   numbers. A row is restored only when it is **invalid as stored and valid
 *   with the zero back, as an Italian leading zero** — exactly the inverse of
 *   what the import did, and nothing a person could have typed on the form,
 *   which refuses an invalid number.
 *
 * Anything else is left alone: a valid number already in shape, an empty
 * pair, and a number invalid either way, which is a person's to correct, not
 * a migration's to guess. Athletes (soft-deleted included, so a restore comes
 * back right) and academies both carry the pair.
 *
 * **What it changed goes to the log, without the numbers.** A phone number is
 * personal data (`PiiRedactor` lists the column), so each line names the row,
 * the fix and the last three digits, then a closing count.
 *
 * Self-contained on purpose: a migration must still do what it did the day it
 * ran, so it calls libphonenumber directly rather than the app's own
 * `PhonePair`, which may change. Idempotent: a second run finds every row in
 * shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        $changed = 0;
        foreach (['athletes', 'academies'] as $table) {
            $changed += $this->normalise($table);
        }

        Log::info('phone numbers checked against their national significant number (#1867)', [
            'changed' => $changed,
        ]);
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

        DB::table($table)
            ->whereNotNull('phone_country_code')
            ->whereNotNull('phone_national_number')
            ->orderBy('id')
            ->select('id', 'phone_country_code', 'phone_national_number')
            ->chunk(500, function ($rows) use ($table, &$changed): void {
                foreach ($rows as $row) {
                    $countryCode = \is_string($row->phone_country_code) ? $row->phone_country_code : '';
                    $national = \is_string($row->phone_national_number) ? $row->phone_national_number : '';
                    $fixed = $this->fix($countryCode, $national);
                    if ($fixed === null) {
                        continue;
                    }

                    DB::table($table)->where('id', $row->id)->update(['phone_national_number' => $fixed['number']]);
                    $changed++;
                    Log::info('phone number normalised (#1867)', [
                        'table' => $table,
                        'id' => $row->id,
                        'fix' => $fixed['fix'],
                        'ends_with' => substr($fixed['number'], -3),
                    ]);
                }
            });

        return $changed;
    }

    /**
     * @return array{number: string, fix: string}|null null when the row is
     *                                                  already right or cannot
     *                                                  be put right
     */
    private function fix(string $countryCode, string $national): ?array
    {
        if ($countryCode === '' || ! ctype_digit($national)) {
            return null;
        }

        $util = PhoneNumberUtil::getInstance();

        $number = $this->parse($util, $countryCode . $national);
        if ($number !== null && $util->isValidNumber($number)) {
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

        // Invalid as stored. The import's one way of producing that: an
        // Italian leading zero it dropped.
        $withZero = $this->parse($util, $countryCode . '0' . $national);
        if ($withZero !== null && $withZero->isItalianLeadingZero() && $util->isValidNumber($withZero)) {
            return [
                'number' => $util->getNationalSignificantNumber($withZero),
                'fix' => 'restored the Italian leading zero',
            ];
        }

        return null;
    }

    private function parse(PhoneNumberUtil $util, string $e164): ?\libphonenumber\PhoneNumber
    {
        try {
            return $util->parse($e164, null);
        } catch (NumberParseException) {
            return null;
        }
    }
};
