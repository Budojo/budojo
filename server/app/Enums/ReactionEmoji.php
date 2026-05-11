<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Allowed emoji on `post_reactions` (#600, M9). V1 hard-codes a short
 * positive-only set — clap + pray are the BJJ-cultural fit for "ben
 * fatto" e "rispetto / namaste". Configurability per academy is
 * deferred (open question in the PRD); V2 considers extending the
 * set if 2+ academies request different defaults.
 *
 * Storing the emoji as a string column (vs the literal unicode char)
 * keeps the column SQL-friendly across MySQL collations and Cypress
 * fixture readability — the SPA renders the visual glyph from this
 * key.
 */
enum ReactionEmoji: string
{
    case Clap = 'clap';
    case Pray = 'pray';
}
