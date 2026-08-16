<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\LicenseState;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property LicenseState $resource
 */
class LicenseResource extends JsonResource
{
    /**
     * @return array{status: string, days_remaining: int|null, licensee: string|null, expires_at: string|null}
     */
    public function toArray(Request $request): array
    {
        return [
            'status' => $this->resource->status->value,
            // Null means "no countdown to show" — a perpetual key, or a build
            // that does not enforce licensing at all.
            'days_remaining' => $this->resource->daysRemaining,
            'licensee' => $this->resource->licensee,
            'expires_at' => $this->resource->expiresAt?->format('Y-m-d'),
        ];
    }
}
