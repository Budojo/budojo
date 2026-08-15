<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;

/**
 * Feeds the desktop shell's native toasts (#1225, M11 #1218): prints, as
 * JSON, the owner's in-app notifications created after a watermark.
 *
 * The Electron main process runs this on its poll, shows one OS notification
 * per row, and advances its own delivery ledger. Delivery state lives on the
 * desktop side on purpose: the server owns notification content and history
 * (the `notifications` table, the bell), the shell owns what has reached the
 * screen — the same split as `php-server.pid`. No schema change, no auth
 * surface: a local command over a local database.
 *
 * Owner rows only. On a single-user desktop that is the one human present;
 * athlete-side rows would belong to accounts the profile does not have.
 */
class ListDesktopNotifications extends Command
{
    private const int MAX_LIMIT = 200;

    protected $signature = 'budojo:list-desktop-notifications'
        . ' {--after= : ISO-8601 instant; only rows created strictly after it (default: last 24 hours)}'
        . ' {--limit=50 : Maximum rows, oldest first, capped at 200}';

    protected $description = 'Print owner in-app notifications newer than a watermark as JSON, for the desktop toasts (#1225)';

    public function handle(): int
    {
        $after = $this->resolveAfter();

        if ($after === null) {
            $this->error('--after must be an ISO-8601 instant, e.g. 2026-08-15T09:00:00Z');

            return self::INVALID;
        }

        $limit = min(max((int) $this->option('limit'), 1), self::MAX_LIMIT);

        $rows = DatabaseNotification::query()
            ->where('notifiable_type', User::class)
            ->whereIn('notifiable_id', User::query()->where('role', UserRole::Owner)->select('id'))
            ->where('created_at', '>', $after)
            ->orderBy('created_at')
            ->orderBy('id')
            ->limit($limit)
            ->get();

        $payload = $rows
            ->map(static function (DatabaseNotification $row): array {
                /** @var array<string, mixed> $data */
                $data = $row->data;
                $text = static fn (string $key): string => \is_string($data[$key] ?? null) ? $data[$key] : '';

                return [
                    'id' => $row->id,
                    'created_at' => $row->created_at?->toIso8601String(),
                    'title' => $text('title'),
                    'body' => $text('body'),
                    'link' => $text('link'),
                    'kind' => $text('kind'),
                ];
            })
            ->filter(static fn (array $item): bool => $item['title'] !== '')
            ->values()
            ->all();

        $this->line((string) json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return self::SUCCESS;
    }

    private function resolveAfter(): ?Carbon
    {
        $raw = $this->option('after');

        if (! \is_string($raw) || $raw === '') {
            return Carbon::now()->subDay();
        }

        try {
            return Carbon::parse($raw);
        } catch (\Throwable) {
            return null;
        }
    }
}
