<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;

class UpdateAcademyAction
{
    /**
     * Partial update: only keys present in $validated are applied. The slug
     * is immutable by design and is never touched here — renames keep the
     * original permalink stable (see UpdateAcademyRequest::rules() comment).
     *
     * `update()` hydrates the model's attributes in-memory before persisting,
     * so the returned instance is already in sync with the DB. No `fresh()`
     * round-trip needed — and no null-coalesce sleight of hand masking an
     * unexpected "row vanished between update and re-read" state.
     *
     * @param  array<string, mixed>  $validated  Output of FormRequest::validated()
     */
    public function execute(Academy $academy, array $validated): Academy
    {
        $academy->update($validated);

        return $academy;
    }
}
