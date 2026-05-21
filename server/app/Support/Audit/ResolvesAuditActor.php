<?php

declare(strict_types=1);

namespace App\Support\Audit;

use App\Models\User;
use Illuminate\Support\Facades\Auth;

// Auth::user() narrowing extracted once — every audit observer needs it.
trait ResolvesAuditActor
{
    private function currentActor(): ?User
    {
        $user = Auth::user();

        return $user instanceof User ? $user : null;
    }
}
