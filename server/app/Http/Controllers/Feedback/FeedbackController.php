<?php

declare(strict_types=1);

namespace App\Http\Controllers\Feedback;

use App\Actions\Feedback\SubmitFeedbackAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Feedback\SubmitFeedbackRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class FeedbackController extends Controller
{
    public function __construct(
        private readonly SubmitFeedbackAction $submitAction,
    ) {
    }

    public function store(SubmitFeedbackRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $this->submitAction->execute(
            user: $user,
            subjectLine: $request->string('subject')->toString(),
            description: $request->string('description')->toString(),
            appVersion: $request->string('app_version')->toString(),
            userAgent: $request->userAgent() ?? '',
            image: $request->file('image') instanceof \Illuminate\Http\UploadedFile
                ? $request->file('image')
                : null,
        );

        // 202 Accepted is the right shape for a fire-and-forget side
        // effect (the user doesn't wait on a "did it actually deliver?"
        // because Mail::send is sync but bounces / mailbox-side issues
        // are out of band). 204 No Content would also be valid; 202
        // signals the asynchronous nature better and matches what
        // similar feedback APIs (Sentry, Linear) emit.
        return response()->json(['message' => 'Feedback received.'], 202);
    }
}
