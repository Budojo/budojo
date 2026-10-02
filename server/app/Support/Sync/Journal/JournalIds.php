<?php

declare(strict_types=1);

namespace App\Support\Sync\Journal;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * A new entry's id (#2031): a ULID above every id this device has recorded.
 * A ULID taken from the clock alone goes backwards when the clock steps
 * back, and `devices/` reads "holds through X" as "holds every entry up to
 * X" (`docs/sync/protocol.md`); then the newest recorded id plus one.
 */
final class JournalIds
{
    private const string ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    public static function next(string $device): string
    {
        // The app's clock, which a test can step back like a real one.
        $candidate = (string) Str::ulid(Carbon::now());
        $newest = DB::table('sync_entries')->where('device', $device)->max('id');

        return \is_string($newest) && strcmp($candidate, $newest) <= 0 ? self::increment($newest) : $candidate;
    }

    /** The ULID one above, in Crockford base 32. */
    public static function increment(string $ulid): string
    {
        $digits = str_split($ulid);
        for ($i = \count($digits) - 1; $i >= 0; $i--) {
            $value = strpos(self::ALPHABET, $digits[$i]);
            if ($value === false) {
                throw new \InvalidArgumentException("not a ULID: {$ulid}");
            }
            if ($value < 31) {
                $digits[$i] = self::ALPHABET[$value + 1];

                return implode('', $digits);
            }
            $digits[$i] = '0';
        }

        throw new \OverflowException("no ULID above {$ulid}");
    }
}
