<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\AppLocale;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Messages in the language the caller reads (`users.locale`, #1912), never
 * raw English: the promotion history's own (#1991, `lang/{en,it}/promotions.php`)
 * and, through `ownersLocale()`, the athlete record's (#2006). A message
 * Laravel writes for a shape rule stays as it is.
 */
trait SpeaksTheOwnersLanguage
{
    /** @param array<string, string> $replace */
    protected function promotionLine(string $key, array $replace = []): string
    {
        $line = __("promotions.{$key}", $replace, $this->ownerLocale());

        return \is_string($line) ? $line : $key;
    }

    /**
     * A line chosen by a count — "1 grado", "3 gradi".
     *
     * @param array<string, string> $replace
     */
    protected function promotionChoice(string $key, int $count, array $replace = []): string
    {
        return trans_choice("promotions.{$key}", $count, $replace, $this->ownerLocale());
    }

    /** "18 novembre 2025", "18 November 2025". */
    protected function ownerDate(CarbonInterface $day): string
    {
        $localised = CarbonImmutable::instance($day)->locale($this->ownerLocale());

        return $localised instanceof CarbonInterface ? $localised->translatedFormat('j F Y') : $day->format('Y-m-d');
    }

    /** English for a caller who never chose a language, as the SPA defaults. */
    protected function ownersLocale(): AppLocale
    {
        $user = $this->user();
        $locale = $user instanceof User ? $user->locale : null;

        return $locale ?? AppLocale::En;
    }

    private function ownerLocale(): string
    {
        return $this->ownersLocale()->value;
    }
}
