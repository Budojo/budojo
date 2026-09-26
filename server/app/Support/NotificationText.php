<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * The sentence a notification shows, in the reader's language (#1912).
 *
 * The owner's alerts and digests used to store a title and a body written in
 * English the moment they were created, so an Italian app showed English in
 * the inbox and in the Windows notification alike. They store their
 * parameters now (`params`), and both readers — `NotificationInboxController`
 * and `budojo:list-desktop-notifications` — ask this class for the words, in
 * the language the owner's app is set to.
 *
 * Anything it does not write — a kind the desktop never sends, or a row whose
 * parameters are not all there — falls back to the stored title and body,
 * which stay on every row for exactly that.
 */
final class NotificationText
{
    /**
     * @param  array<array-key, mixed>  $data  The notification's `data` column.
     * @return array{title: string, body: string}
     */
    public static function of(array $data, string $locale): array
    {
        $params = $data['params'] ?? null;
        $kind = $data['kind'] ?? null;
        $written = \is_array($params) && \is_string($kind) ? self::write($kind, $params, $locale) : null;

        return $written ?? [
            'title' => \is_string($data['title'] ?? null) ? $data['title'] : '',
            'body' => \is_string($data['body'] ?? null) ? $data['body'] : '',
        ];
    }

    /**
     * @param  array<array-key, mixed>  $p
     * @return array{title: string, body: string}|null
     */
    private static function write(string $kind, array $p, string $locale): ?array
    {
        return match ($kind) {
            'owner_athlete_missed_streak' => self::missedStreak($p, $locale),
            'unpaid_athletes_digest' => self::unpaidDigest($p, $locale),
            'medical_cert_expiry_reminders' => self::medicalDigest($p, $locale),
            'academy_document_expiry_reminders' => self::academyDocuments($p, $locale),
            default => null,
        };
    }

    /**
     * @param  array<array-key, mixed>  $p
     * @return array{title: string, body: string}|null
     */
    private static function missedStreak(array $p, string $locale): ?array
    {
        if (! \is_string($p['name'] ?? null) || ! \is_int($p['count'] ?? null)) {
            return null;
        }

        return [
            'title' => self::line('notifications.missed_streak.title', ['name' => $p['name']], $locale),
            'body' => self::choice('notifications.missed_streak.body', $p['count'], [], $locale),
        ];
    }

    /**
     * @param  array<array-key, mixed>  $p
     * @return array{title: string, body: string}|null
     */
    private static function unpaidDigest(array $p, string $locale): ?array
    {
        $year = $p['year'] ?? null;
        $month = $p['month'] ?? null;
        $names = self::names($p, $locale);
        if (! \is_int($p['count'] ?? null) || ! \is_int($year) || ! \is_int($month) || $month < 1 || $month > 12 || $names === null) {
            return null;
        }

        // The month, not "this month": the row outlives the month it is about.
        $monthName = self::dateIn(CarbonImmutable::parse(\sprintf('%04d-%02d-01', $year, $month)), 'F', $locale);

        return [
            'title' => self::choice('notifications.unpaid_digest.title', $p['count'], ['month' => $monthName], $locale),
            'body' => $names,
        ];
    }

    /**
     * @param  array<array-key, mixed>  $p
     * @return array{title: string, body: string}|null
     */
    private static function medicalDigest(array $p, string $locale): ?array
    {
        $names = self::names($p, $locale);
        if (! \is_int($p['count'] ?? null) || $names === null) {
            return null;
        }

        return [
            'title' => self::choice('notifications.medical_digest.title', $p['count'], [], $locale),
            'body' => $names,
        ];
    }

    /**
     * @param  array<array-key, mixed>  $p
     * @return array{title: string, body: string}|null
     */
    private static function academyDocuments(array $p, string $locale): ?array
    {
        $documents = $p['documents'] ?? null;
        if (! \is_int($p['count'] ?? null) || ! \is_array($documents)) {
            return null;
        }

        $lines = [];
        foreach ($documents as $document) {
            if (! \is_array($document) || ! \is_string($document['name'] ?? null)) {
                return null;
            }
            $expiresOn = $document['expires_on'] ?? null;
            $lines[] = \is_string($expiresOn)
                ? self::line('notifications.document_expires', [
                    'name' => $document['name'],
                    'date' => self::dateIn(CarbonImmutable::parse($expiresOn), 'j F Y', $locale),
                ], $locale)
                : $document['name'];
        }

        return [
            'title' => self::choice('notifications.academy_documents_digest.title', $p['count'], [], $locale),
            'body' => implode("\n", $lines),
        ];
    }

    /**
     * "Anna, Dario, Samuele e altri 3" — the first names a digest carries and
     * how many it left out. Null when the parameters are not a list of names.
     *
     * @param  array<array-key, mixed>  $p
     */
    private static function names(array $p, string $locale): ?string
    {
        $names = $p['names'] ?? null;
        $more = $p['more'] ?? 0;
        if (! \is_array($names) || ! \is_int($more)) {
            return null;
        }
        $strings = array_values(array_filter($names, \is_string(...)));
        if (\count($strings) !== \count($names)) {
            return null;
        }
        $shown = implode(', ', $strings);

        return $more > 0
            ? self::line('notifications.names_and_more', ['names' => $shown, 'more' => (string) $more], $locale)
            : $shown;
    }

    /** "settembre", "1 ottobre 2026": month names in the reader's language. */
    private static function dateIn(CarbonImmutable $date, string $format, string $locale): string
    {
        $localised = $date->locale($locale);

        return $localised instanceof CarbonInterface ? $localised->translatedFormat($format) : $date->format($format);
    }

    /** @param  array<string, string>  $replace */
    private static function line(string $key, array $replace, string $locale): string
    {
        $line = __($key, $replace, $locale);

        return \is_string($line) ? $line : $key;
    }

    /** @param  array<string, string>  $replace */
    private static function choice(string $key, int $count, array $replace, string $locale): string
    {
        return trans_choice($key, $count, $replace, $locale);
    }
}
