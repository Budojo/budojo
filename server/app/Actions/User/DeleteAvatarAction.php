<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\User;
use Illuminate\Support\Facades\Storage;

class DeleteAvatarAction
{
    public function execute(User $user): User
    {
        $path = $user->avatar_path;
        if ($path === null) {
            // Idempotent: deleting a missing avatar is a no-op success,
            // matching the academy-logo precedent (DeleteAcademyLogoAction).
            return $user;
        }

        Storage::disk('public')->delete($path);
        $user->forceFill(['avatar_path' => null])->save();

        return $user->refresh();
    }
}
