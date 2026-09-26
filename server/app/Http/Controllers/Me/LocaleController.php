<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Enums\AppLocale;
use App\Http\Controllers\Controller;
use App\Http\Requests\Me\UpdateLocaleRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * The language the user reads the app in (#1912). The server writes their
 * notifications — the inbox and the Windows notification — so it has to be
 * told, and the SPA tells it whenever its language switch changes.
 */
class LocaleController extends Controller
{
    public function update(UpdateLocaleRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->update(['locale' => AppLocale::from($request->string('locale')->toString())]);

        return response()->json(['data' => ['locale' => $user->locale?->value]]);
    }
}
