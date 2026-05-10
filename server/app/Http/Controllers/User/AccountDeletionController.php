<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Actions\User\CancelAccountDeletionAction;
use App\Actions\User\CancelAccountDeletionByTokenAction;
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
        private readonly CancelAccountDeletionByTokenAction $cancelByToken,
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

    /**
     * Public, unauthenticated entry point that consumes the one-time
     * token from the confirmation email (#545). The route binding
     * constrains `{token}` to the 64-char shape so a malformed link
     * 404s at the routing layer without a DB roundtrip.
     *
     * Returns 200 with `cancelled: true|false`:
     * - `true`  — token matched an active row, cancelled, account safe.
     * - `false` — already cancelled / never valid / already purged. The
     *   SPA renders the same "deletion is no longer pending" page either
     *   way; we don't leak whether the link was used vs invalid.
     */
    public function cancelByToken(string $token): JsonResponse
    {
        $cancelled = $this->cancelByToken->execute($token);

        return response()->json(['data' => ['cancelled' => $cancelled]]);
    }
}
