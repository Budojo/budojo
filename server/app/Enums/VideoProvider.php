<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Supported sources for a shared-video community post (#1153). The host
 * list doubles as the **SSRF allowlist**: the server-side preview resolver
 * only ever fetches these fixed public domains, so there is no way to point
 * it at an internal address (an attacker can't rebind these domains' DNS).
 *
 * Adding a provider = a new case + its hosts here (open/closed); the
 * resolver matches on the case.
 */
enum VideoProvider: string
{
    case Instagram = 'instagram';
    case YouTube = 'youtube';
    case TikTok = 'tiktok';

    /**
     * Registrable hostnames for this provider. Matching also accepts
     * subdomains (`www.`, `m.`, …) — see {@see self::fromHost()}.
     *
     * @return list<string>
     */
    public function hosts(): array
    {
        return match ($this) {
            self::Instagram => ['instagram.com'],
            self::YouTube => ['youtube.com', 'youtu.be'],
            self::TikTok => ['tiktok.com'],
        };
    }

    /**
     * Resolve the provider for a URL host (case-insensitive, subdomain-aware),
     * or `null` when the host is not on the allowlist. Subdomain matching is
     * anchored on a leading dot (`m.youtube.com` matches `youtube.com`, but
     * `youtube.com.evil.test` does NOT).
     */
    public static function fromHost(string $host): ?self
    {
        $host = strtolower(trim($host));

        foreach (self::cases() as $provider) {
            foreach ($provider->hosts() as $allowed) {
                if ($host === $allowed || str_ends_with($host, '.' . $allowed)) {
                    return $provider;
                }
            }
        }

        return null;
    }
}
