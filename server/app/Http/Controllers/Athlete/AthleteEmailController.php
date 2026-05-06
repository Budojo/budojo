<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Athlete\ChangeAthleteEmailAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Athlete\ChangeAthleteEmailRequest;
use App\Models\Athlete;
use Illuminate\Http\JsonResponse;

/**
 * Owner-side endpoint for changing an athlete's email (#476).
 * `POST /api/v1/athletes/{athlete}/email`. The action branches on the
 * athlete's lifecycle state (no invitation / pending invitation /
 * linked user) and returns a `mode` discriminator the SPA reads to
 * pick the correct toast copy:
 *
 * - `direct`      — state A; roster email mutated immediately
 * - `invite_swap` — state B; old invite revoked, new one queued to new email
 * - `pending`     — state C; verification mail queued to new email
 *
 * Controllers stay thin: validate via Form Request, delegate to
 * Action, return JSON.
 */
class AthleteEmailController extends Controller
{
    public function __construct(private readonly ChangeAthleteEmailAction $action)
    {
    }

    public function update(ChangeAthleteEmailRequest $request, Athlete $athlete): JsonResponse
    {
        $sender = $request->user();
        \assert($sender !== null);

        $result = $this->action->execute(
            $sender,
            $athlete,
            $request->string('email')->toString(),
        );

        return response()->json([
            'data' => [
                'mode' => $result['mode'],
            ],
        ]);
    }
}
