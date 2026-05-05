<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\SupportTicket;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Lean response — the SPA only renders a confirmation toast after a
 * successful submission and never re-reads the ticket back, so we
 * intentionally surface only the fields the client genuinely needs to
 * cite (the id, for any future "copy ticket reference" affordance) and
 * the timestamp the user can echo back to support if they need to
 * follow up by email.
 */
class SupportTicketResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var SupportTicket $ticket */
        $ticket = $this->resource;

        return [
            'id' => $ticket->id,
            'created_at' => $ticket->created_at->toIso8601String(),
        ];
    }
}
