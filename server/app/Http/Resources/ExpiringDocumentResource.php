<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Athlete;
use Illuminate\Http\Request;

/**
 * A document on the list of papers to chase (#1931): the same row as
 * {@see DocumentResource}, with the athlete's phone so the page can offer
 * the reminder on WhatsApp. Only this list carries it — an athlete's own
 * documents tab already sits on a page that has their number.
 */
class ExpiringDocumentResource extends DocumentResource
{
    /**
     * @return array<string, mixed>
     */
    protected function athleteOf(Athlete $athlete, Request $request): array
    {
        return new ContactableAthleteResource($athlete)->toArray($request);
    }
}
