<?php

declare(strict_types=1);

namespace App\Http\Controllers\Reminder;

use App\Actions\Notification\ForecastOwnerRemindersAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\UpcomingReminderResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The owner's reminders of the next fourteen days (#2047), which the phone
 * schedules with Android at every opening and sync. Read-only: what has been
 * scheduled is the phone's to remember, as what has been shown is the
 * desktop's (#1225).
 */
class UpcomingRemindersController extends Controller
{
    public function __construct(
        private readonly ForecastOwnerRemindersAction $forecast,
    ) {
    }

    public function __invoke(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $academy = $user->activeAcademy();
        if ($academy === null) {
            return response()->json(['message' => 'No academy found.'], 403);
        }

        return UpcomingReminderResource::collection($this->forecast->execute($user, $academy));
    }
}
