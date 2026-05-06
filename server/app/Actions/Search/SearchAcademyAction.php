<?php

declare(strict_types=1);

namespace App\Actions\Search;

use App\Models\Academy;
use App\Models\Athlete;
use Illuminate\Database\Eloquent\Collection;

/**
 * Search the authenticated academy's roster for athletes matching a free-
 * text query. Returns up to `MAX_RESULTS` rows; an empty / whitespace-only
 * query short-circuits to an empty collection without touching the DB.
 *
 * Why a dedicated Action instead of reusing `AthleteController::index`:
 * the palette has a tighter contract — capped result count, no pagination
 * envelope, no sort knobs. Squeezing those three differences into the
 * existing controller via more `if` branches would violate SRP (Clean
 * Code § small functions, one reason to change). Co-locating the search
 * primitive here keeps the index controller honest and lets this Action
 * grow into multi-surface search (academies, payments — issue #426 leaves
 * that out of V1 scope) without touching list code.
 *
 * The match shape is deliberately the same as `AthleteController::index`'s
 * `?q=` filter (token-AND across first_name + last_name): users have a
 * single mental model for "type letters, find people". A divergence here
 * would feel like a bug.
 */
class SearchAcademyAction
{
    /**
     * Hard cap on the number of athletes returned in a single search call.
     * 20 mirrors the athletes-list page size; rendering more than that in
     * a floating popover is a Miller's-law violation (~7±2 working-memory
     * chunks). The user narrows further by typing.
     */
    public const int MAX_RESULTS = 20;

    /**
     * @return Collection<int, Athlete>
     */
    public function execute(Academy $academy, string $query): Collection
    {
        $query = trim($query);
        if ($query === '') {
            // Empty query → empty result. Loading the full roster on every
            // keystroke would defeat the palette's whole purpose (cheap to
            // open, render nothing until the user has a signal). The SPA's
            // 200ms debounce + the empty-guard here are the two layers
            // that keep the wire quiet.
            return new Collection();
        }

        $tokens = preg_split('/\s+/', $query);
        if ($tokens === false) {
            return new Collection();
        }

        $builder = $academy->athletes();

        foreach ($tokens as $token) {
            if ($token === '') {
                continue;
            }
            $like = '%' . $token . '%';
            $builder->where(function ($qb) use ($like): void {
                $qb->where('first_name', 'LIKE', $like)
                    ->orWhere('last_name', 'LIKE', $like);
            });
        }

        // Stable ordering for deterministic results. last_name asc + id asc
        // keeps two athletes who share both fields in insertion order; the
        // SPA's keyboard navigation depends on a stable order so "first
        // result" means the same row across re-fetches of the same query.
        return $builder
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->orderBy('id')
            ->limit(self::MAX_RESULTS)
            ->get();
    }
}
