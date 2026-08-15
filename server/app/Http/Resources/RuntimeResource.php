<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Enums\Capability;
use App\Enums\RuntimeProfile;
use App\Support\Capabilities;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property RuntimeProfile $resource
 */
class RuntimeResource extends JsonResource
{
    /**
     * @return array{profile: string, capabilities: list<string>}
     */
    public function toArray(Request $request): array
    {
        return [
            'profile' => $this->resource->value,
            'capabilities' => array_map(
                static fn (Capability $capability): string => $capability->value,
                Capabilities::all(),
            ),
        ];
    }
}
