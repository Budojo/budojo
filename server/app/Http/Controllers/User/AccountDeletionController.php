<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Actions\User\CancelAccountDeletionAction;
use App\Actions\User\RequestAccountDeletionAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\User\RequestAccountDeletionRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GDPR Art. 17 right-to-erasure entry points (#223). The user
 * requests deletion (POST) — they enter a 30-day grace window —
 * and may cancel during that window (DELETE). After the window,
 * the hourly Artisan command `budojo:purge-expired-pending-deletions`
 * (scheduled in `routes/console.php`) runs `PurgeAccountAction`
 * to do the actual hard-delete.
 */
class AccountDeletionController extends Controller
{
    public function __construct(
        private readonly RequestAccountDeletionAction $request,
        private readonly CancelAccountDeletionAction $cancel,
    ) {
    }

    public function store(RequestAccountDeletionRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $pending = $this->request->execute($user, $request->string('password')->toString());

        return response()->json([
            'data' => [
                'requested_at' => $pending->requested_at->toIso8601String(),
                'scheduled_for' => $pending->scheduled_for->toIso8601String(),
                'grace_days' => RequestAccountDeletionAction::GRACE_DAYS,
            ],
        ], 202);
    }

    public function destroy(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $cancelled = $this->cancel->execute($user);

        // 200 either way — cancelling something that was never pending
        // is a no-op, not an error. The boolean tells the SPA whether
        // to flash a success toast or stay silent.
        return response()->json(['data' => ['cancelled' => $cancelled]]);
    }
}
