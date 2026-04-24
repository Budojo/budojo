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
     * @param  array<string, mixed>  $validated  Output of FormRequest::validated()
     */
    public function execute(Academy $academy, array $validated): Academy
    {
        $academy->update($validated);

        return $academy->fresh() ?? $academy;
    }
}
