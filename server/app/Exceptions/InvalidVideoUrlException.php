<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * Thrown by {@see \App\Actions\Community\ResolveVideoPreviewAction} when a
 * shared-video URL is not on the provider allowlist or its preview can't be
 * resolved (deleted / private / provider error). The controller maps it to a
 * 422 so the SPA can show "we couldn't read that link".
 */
final class InvalidVideoUrlException extends \RuntimeException
{
}
