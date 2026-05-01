<?php

declare(strict_types=1);

namespace App\Actions\Feedback;

use App\Mail\FeedbackMail;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;

/**
 * Orchestrates an in-app feedback submission (#311):
 *
 * 1. Builds the FeedbackMail with the user-supplied text + the
 *    server-derived context (User-Agent, app version, user email).
 * 2. If an image was uploaded, hands its temporary path to the
 *    Mailable as an attachment. We never persist the image — once the
 *    mail is sent it's gone with the request lifecycle, which is what
 *    we want (no orphan storage, no GDPR retention question).
 * 3. Fires the mail synchronously to the hardcoded owner address.
 *
 * The recipient is intentionally hardcoded: this is a single-owner
 * product, every feedback goes to the same inbox. A future "DPO mailbox"
 * or "support team" routing would extract the recipient as a config
 * value, but until then the constant is the truth and lives next to the
 * action that uses it.
 */
class SubmitFeedbackAction
{
    /**
     * Recipient for every feedback email. Hardcoded by design — single-
     * owner product, single inbox. See class docblock.
     */
    public const string OWNER_EMAIL = 'matteobonanno1990@gmail.com';

    public function execute(
        User $user,
        string $subjectLine,
        string $description,
        string $appVersion,
        string $userAgent,
        ?UploadedFile $image = null,
    ): void {
        // getRealPath() returns false for files that don't physically
        // exist on disk (rare but possible — e.g. an in-memory test
        // double); coerce false → null so the Mailable's typed
        // string|null contract holds.
        $imagePath = $image?->getRealPath();
        if ($imagePath === false) {
            $imagePath = null;
        }

        $mail = new FeedbackMail(
            subjectLine: $subjectLine,
            description: $description,
            userEmail: $user->email,
            academyId: $user->academy?->id,
            appVersion: $appVersion !== '' ? $appVersion : 'unknown',
            userAgent: $userAgent !== '' ? $userAgent : 'unknown',
            imagePath: $imagePath,
            imageOriginalName: $image?->getClientOriginalName(),
        );

        Mail::to(self::OWNER_EMAIL)->send($mail);
    }
}
