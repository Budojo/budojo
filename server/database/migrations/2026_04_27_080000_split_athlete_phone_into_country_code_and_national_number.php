<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberFormat;
use libphonenumber\PhoneNumberUtil;

return new class extends Migration
{
    /**
     * #75 — Split the freeform `athletes.phone` text column into a
     * structured pair: `phone_country_code` (E.164 country prefix, e.g.
     * `+39`) and `phone_national_number` (the rest, e.g. `3331234567`).
     *
     * The pair is jointly nullable: either both filled or both null. The
     * single-text shape carried unverified user typing; the new shape is
     * validated server-side via libphonenumber on every write.
     *
     * Backfill: parse each existing freeform value with libphonenumber
     * (Italy as the default region — the only academy seeded today is
     * IT-based). Anything that parses cleanly populates the new pair;
     * unparseable text becomes `null` (the user re-enters on next edit).
     */
    public function up(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            // Country code stays small — even the longest dial codes
            // (`+1-684`, etc.) fit in 5 chars including the `+`.
            $table->string('phone_country_code', 5)->nullable()->after('email');
            // 15 digits is the E.164 max + a bit of headroom. We store
            // unformatted digits only; formatting happens at render time.
            $table->string('phone_national_number', 20)->nullable()->after('phone_country_code');
        });

        $util = PhoneNumberUtil::getInstance();
        DB::table('athletes')->whereNotNull('phone')->orderBy('id')->each(function ($row) use ($util) {
            $raw = is_string($row->phone) ? trim($row->phone) : '';
            if ($raw === '') {
                return;
            }

            try {
                $parsed = $util->parse($raw, 'IT');
            } catch (NumberParseException) {
                return; // unparseable → leave the new columns null
            }

            if (! $util->isValidNumber($parsed)) {
                return;
            }

            DB::table('athletes')->where('id', $row->id)->update([
                'phone_country_code' => '+' . $parsed->getCountryCode(),
                'phone_national_number' => (string) $parsed->getNationalNumber(),
            ]);
        });

        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropColumn('phone');
        });
    }

    public function down(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->string('phone', 30)->nullable()->after('email');
        });

        // Best-effort recompose for rollback — formats the structured pair
        // back to canonical E.164 (e.g. `+393331234567` — no spaces, no
        // separators). Anything missing the pair stays null.
        $util = PhoneNumberUtil::getInstance();
        DB::table('athletes')
            ->whereNotNull('phone_country_code')
            ->whereNotNull('phone_national_number')
            ->orderBy('id')
            ->each(function ($row) use ($util) {
                try {
                    $parsed = $util->parse(
                        $row->phone_country_code . $row->phone_national_number,
                        null
                    );
                } catch (NumberParseException) {
                    return;
                }

                DB::table('athletes')->where('id', $row->id)->update([
                    'phone' => $util->format($parsed, PhoneNumberFormat::E164),
                ]);
            });

        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropColumn(['phone_country_code', 'phone_national_number']);
        });
    }
};
