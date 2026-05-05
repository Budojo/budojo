<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * The four categories a user can pick when filing a support ticket
 * (#423). Backed string enum so the value lands in the DB column and
 * crosses the API boundary as `account` / `billing` / `bug` / `other`.
 *
 * Case names use UpperCamelCase per Laravel / PHP enum convention; the
 * backing string values stay lower-case kebab-friendly so the JSON
 * payload reads naturally on both ends (the Angular union mirror is
 * the same set of strings).
 */
enum SupportTicketCategory: string
{
    case Account = 'account';
    case Billing = 'billing';
    case Bug = 'bug';
    case Other = 'other';
}
