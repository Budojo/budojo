<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;
use App\Models\User;
use Illuminate\Support\Str;

class CreateAcademyAction
{
    public function execute(User $user, string $name, ?string $address): Academy
    {
        return Academy::create([
            'user_id' => $user->id,
            'name' => $name,
            'slug' => $this->uniqueSlug($name),
            'address' => $address,
        ]);
    }

    private function uniqueSlug(string $name): string
    {
        return Str::slug($name) . '-' . Str::lower(Str::random(8));
    }
}
