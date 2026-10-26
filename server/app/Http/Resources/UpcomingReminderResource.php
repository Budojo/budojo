<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\UpcomingReminder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property UpcomingReminder $resource
 */
class UpcomingReminderResource extends JsonResource
{
    /**
     * @return array{key: string, at: string, title: string, body: string, link: string}
     */
    public function toArray(Request $request): array
    {
        return [
            'key' => $this->resource->key,
            // With the operator's offset: the phone schedules the instant, whatever its own zone.
            'at' => $this->resource->at->toIso8601String(),
            'title' => $this->resource->title,
            'body' => $this->resource->body,
            'link' => $this->resource->link,
        ];
    }
}
