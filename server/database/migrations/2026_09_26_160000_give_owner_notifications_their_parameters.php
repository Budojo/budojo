<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The owner's notifications already in an inbox get the `params` new ones are
 * written with (#1912), so they are shown in the owner's language too and not
 * only the ones that arrive from now on.
 *
 * They were stored as English sentences, so this reads the parameters back
 * out of those sentences and out of the ids and counts beside them. A row it
 * cannot read is left as it was: its stored sentence is still the fallback.
 */
return new class extends Migration
{
    private const KINDS = [
        'owner_athlete_missed_streak',
        'unpaid_athletes_digest',
        'medical_cert_expiry_reminders',
        'academy_document_expiry_reminders',
    ];

    public function up(): void
    {
        DB::table('notifications')->orderBy('id')->each(function (object $row): void {
            $data = \is_string($row->data ?? null) ? json_decode($row->data, true) : null;
            if (! \is_array($data) || isset($data['params']) || ! \in_array($data['kind'] ?? null, self::KINDS, true)) {
                return;
            }

            $params = $this->paramsOf($data);
            if ($params === null) {
                return;
            }

            DB::table('notifications')->where('id', $row->id)->update([
                'data' => json_encode([...$data, 'params' => $params], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            ]);
        });
    }

    public function down(): void
    {
        // Nothing to undo: the stored sentences were never touched.
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return array<string, mixed>|null
     */
    private function paramsOf(array $data): ?array
    {
        $title = \is_string($data['title'] ?? null) ? $data['title'] : '';
        $body = \is_string($data['body'] ?? null) ? $data['body'] : '';

        return match ($data['kind']) {
            'owner_athlete_missed_streak' => $this->missedStreak($title, $data['consecutive'] ?? null),
            'unpaid_athletes_digest' => $this->unpaidDigest($title, $body, $data['year'] ?? null, $data['month'] ?? null),
            'medical_cert_expiry_reminders' => $this->medicalDigest($body, $data['document_ids'] ?? null),
            default => $this->academyDocuments($body, $data['document_ids'] ?? null),
        };
    }

    /** @return array<string, mixed>|null */
    private function missedStreak(string $title, mixed $consecutive): ?array
    {
        if (! \is_int($consecutive) || preg_match("/^(.+) hasn't trained in a while$/u", $title, $m) !== 1) {
            return null;
        }

        return ['name' => $m[1], 'count' => $consecutive];
    }

    /** @return array<string, mixed>|null */
    private function unpaidDigest(string $title, string $body, mixed $year, mixed $month): ?array
    {
        $count = match (true) {
            $title === '1 athlete has not paid this month' => 1,
            preg_match('/^(\d+) athletes have not paid this month$/', $title, $m) === 1 => (int) $m[1],
            default => null,
        };
        $names = $this->namesOf($body);
        if ($count === null || $names === null || ! \is_int($year) || ! \is_int($month)) {
            return null;
        }

        return ['count' => $count, ...$names, 'year' => $year, 'month' => $month];
    }

    /** @return array<string, mixed>|null */
    private function medicalDigest(string $body, mixed $documentIds): ?array
    {
        $names = $this->namesOf($body);
        if (! \is_array($documentIds) || $names === null) {
            return null;
        }

        return ['count' => \count($documentIds), ...$names];
    }

    /** @return array<string, mixed>|null */
    private function academyDocuments(string $body, mixed $documentIds): ?array
    {
        if (! \is_array($documentIds) || $body === '') {
            return null;
        }

        $documents = [];
        foreach (explode("\n", $body) as $line) {
            // '%s — %s', the name and the ISO expiry, which could be empty.
            if (preg_match('/^(.*) — (\d{4}-\d{2}-\d{2})?$/u', $line, $m) !== 1) {
                return null;
            }
            $documents[] = ['name' => $m[1], 'expires_on' => ($m[2] ?? '') !== '' ? $m[2] : null];
        }

        return ['count' => \count($documentIds), 'documents' => $documents];
    }

    /**
     * "Anna, Dario, Samuele and 3 more" back into its names and its count.
     *
     * @return array{names: list<string>, more: int}|null
     */
    private function namesOf(string $body): ?array
    {
        if ($body === '' || preg_match('/^(.*?)(?: and (\d+) more)?$/su', $body, $m) !== 1) {
            return null;
        }

        return ['names' => explode(', ', $m[1]), 'more' => isset($m[2]) ? (int) $m[2] : 0];
    }
};
