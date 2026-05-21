<?php

declare(strict_types=1);

namespace App\Support\Audit;

use App\Models\User;
use Illuminate\Support\Facades\Auth;

// Shared "who's the current actor?" narrowing for every audit observer.
trait ResolvesAuditActor
{
    private function currentActor(): ?User
    {
        $user = Auth::user();

        return $user instanceof User ? $user : null;
    }
}
