<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * How the money came in (#1761): the difference between "revenue for
 * September" and "what I have to reconcile" — the bank statement, the card
 * terminal's report, or the drawer.
 *
 * Four cases and no free text, so the list stays short enough to pick from at
 * the end of an evening (Hick) and a year's rows can be summed by method.
 *
 * **Optional forever.** A null on a payment or a carnet means "not recorded",
 * never a guess: every row written before this existed stays null, and a
 * required field would turn a two-tap mark-paid into a form.
 */
enum PaymentMethod: string
{
    case Cash = 'cash';
    case Transfer = 'transfer';
    /** A card, through the gym's terminal. */
    case Pos = 'pos';
    case Other = 'other';
}
