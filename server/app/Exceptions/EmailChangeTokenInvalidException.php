<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * Thrown by `ConfirmEmailChangeAction::execute()` (#476) when the
 * URL-presented verification token does not match an active row.
 * Three concrete cases collapse to this one exception:
 *
 * - The hash is unknown (link was never issued, or the row was already
 *   consumed by a previous click).
 * - The row exists but `expires_at` is in the past.
 * - The user the row points at no longer exists (FK cascade should
 *   prevent this; defensive).
 *
 * The controller layer catches this and renders a 410 Gone with the
 * stable string body `{message: 'invalid_or_expired_link'}`, so the
 * SPA can render a single error panel without trying to differentiate
 * between the three cases — the user-facing remedy is the same in all
 * three: request a fresh link.
 */
class EmailChangeTokenInvalidException extends \RuntimeException
{
}
