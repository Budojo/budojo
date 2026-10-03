<?php

declare(strict_types=1);

namespace App\Support\Sync\Journal;

use Symfony\Component\HttpFoundation\Response;

/**
 * What a write works out for itself, kept in its journal entry's body (#2031,
 * PRD § 5.2). A payment's amount comes from the fee that applies that day, its
 * period from the athlete's settings, its date from the day: replayed later
 * on another database, each could come out otherwise. **For money that is
 * never left to chance:** the entry carries the values the row got, the
 * replay sends the period and the date back as the request's own, and any
 * difference in the row it makes or finds is a conflict.
 */
final class ResolvedFields
{
    /** Route => the fields of the row it answers with. */
    private const array ROUTES = [
        'athletes.payments.store' => ['amount_cents', 'period_months', 'paid_at'],
    ];

    /** @return list<string> */
    public static function of(string $route): array
    {
        return self::ROUTES[$route] ?? [];
    }

    /**
     * The body, with each resolved field the request left out, as the answer
     * gives it: a moment as its day, the format the requests take.
     *
     * @param  array<string, mixed>|null  $body
     * @return array<string, mixed>|null
     */
    public static function into(string $route, ?array $body, Response $response): ?array
    {
        $fields = self::of($route);
        if ($fields === []) {
            return $body;
        }
        $answer = json_decode((string) $response->getContent(), true);
        $row = \is_array($answer) && \is_array($answer['data'] ?? null) ? $answer['data'] : null;
        if ($row === null) {
            return $body;
        }
        $body ??= [];
        foreach ($fields as $field) {
            if (\array_key_exists($field, $body) || ! \array_key_exists($field, $row)) {
                continue;
            }
            $value = $row[$field];
            $body[$field] = \is_string($value) && preg_match('/^(\d{4}-\d{2}-\d{2})T/', $value, $day) === 1 ? $day[1] : $value;
        }

        return $body;
    }
}
