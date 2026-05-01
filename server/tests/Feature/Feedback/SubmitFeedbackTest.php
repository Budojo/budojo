<?php

declare(strict_types=1);

use App\Actions\Feedback\SubmitFeedbackAction;
use App\Mail\FeedbackMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;

// userWithAcademy() helper lives in tests/Pest.php

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Mail::fake();
});

it('submits a feedback with subject + description and sends the email', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/feedback', [
            'subject' => 'Athletes list paid filter is sticky',
            'description' => 'When I clear the paid filter the URL still carries the query param.',
            'app_version' => 'v1.9.0',
        ])
        ->assertStatus(202)
        ->assertJsonPath('message', 'Feedback received.');

    Mail::assertSent(FeedbackMail::class, function (FeedbackMail $mail) use ($user): bool {
        expect($mail->subjectLine)->toBe('Athletes list paid filter is sticky');
        expect($mail->description)->toContain('paid filter');
        expect($mail->userEmail)->toBe($user->email);
        expect($mail->academyId)->toBe($user->academy?->id);
        expect($mail->appVersion)->toBe('v1.9.0');
        expect($mail->imagePath)->toBeNull();
        expect($mail->hasTo(SubmitFeedbackAction::OWNER_EMAIL))->toBeTrue();

        return true;
    });

    // Envelope shape — checked separately so a mismatch on the subject
    // template gives a clear failure rather than getting buried in the
    // assertSent closure boolean rollup.
    Mail::assertSent(FeedbackMail::class, function (FeedbackMail $mail): bool {
        $envelope = $mail->envelope();

        return $envelope->subject === '[Budojo feedback v1.9.0] Athletes list paid filter is sticky';
    });
});

it('attaches an image when one is uploaded', function (): void {
    $user = userWithAcademy();
    $image = UploadedFile::fake()->image('screenshot.png', 800, 600);

    $this->actingAs($user)
        ->postJson('/api/v1/feedback', [
            'subject' => 'Screenshot of the broken layout',
            'description' => 'The Profile card stacks weirdly on Pixel 8 — see attached.',
            'app_version' => 'v1.9.0',
            'image' => $image,
        ])
        ->assertStatus(202);

    Mail::assertSent(FeedbackMail::class, function (FeedbackMail $mail): bool {
        // The image path is the temp upload path — not asserting it
        // verbatim (lifecycle-bound) but it MUST be non-null when an
        // attachment was provided.
        return $mail->imagePath !== null
            && $mail->imageOriginalName === 'screenshot.png';
    });
});

it('uses the appVersion fallback when the SPA omits the field', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/feedback', [
            'subject' => 'Generic feedback',
            'description' => 'Field-omission case — older bundle without the version probe.',
        ])
        ->assertStatus(202);

    Mail::assertSent(FeedbackMail::class, function (FeedbackMail $mail): bool {
        // Action coerces empty/missing to "unknown" so the email subject
        // still reads as a clean string.
        return $mail->appVersion === 'unknown';
    });
});

it('rejects with 422 when subject is missing', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/feedback', [
            'description' => 'No subject here, server should bounce.',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['subject']);

    Mail::assertNothingSent();
});

it('rejects with 422 when description is missing', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/feedback', [
            'subject' => 'Subject only',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['description']);

    Mail::assertNothingSent();
});

it('rejects with 422 when subject is too short', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/feedback', [
            'subject' => 'X',
            'description' => 'Description is fine but the subject is too short.',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['subject']);
});

it('rejects with 422 when description is too short', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/feedback', [
            'subject' => 'Valid subject line',
            'description' => 'Too short',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['description']);
});

it('rejects with 422 when the image is too large', function (): void {
    $user = userWithAcademy();
    // 6 MB > the 5 MB cap in the rules.
    $image = UploadedFile::fake()->create('huge.png', 6 * 1024, 'image/png');

    $this->actingAs($user)
        ->postJson('/api/v1/feedback', [
            'subject' => 'Big screenshot',
            'description' => 'Image is over the 5 MB cap, server should bounce.',
            'image' => $image,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['image']);

    Mail::assertNothingSent();
});

it('rejects with 422 when the image MIME is unsupported', function (): void {
    $user = userWithAcademy();
    $file = UploadedFile::fake()->create('document.pdf', 100, 'application/pdf');

    $this->actingAs($user)
        ->postJson('/api/v1/feedback', [
            'subject' => 'Wrong MIME',
            'description' => 'Trying to attach a PDF — only images allowed.',
            'image' => $file,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['image']);

    Mail::assertNothingSent();
});

it('rejects with 401 when unauthenticated', function (): void {
    $this->postJson('/api/v1/feedback', [
        'subject' => 'Anonymous feedback',
        'description' => 'No auth, no email.',
    ])->assertStatus(401);

    Mail::assertNothingSent();
});

it('handles a user without an academy gracefully (academy_id null in mail)', function (): void {
    // Server-side defense: a registered user who has not completed setup
    // yet has no academy. The endpoint accepts the submission and the
    // email carries academyId=null. The SPA does NOT expose
    // /dashboard/feedback to pre-setup users (hasAcademyGuard redirects
    // to /setup), so this case is reachable only via a hand-crafted
    // request — which we tolerate rather than 422 because (a) the only
    // PII at risk is the user's own email, and (b) onboarding edge
    // cases (an academy invitation that disappears mid-flow) could
    // otherwise leave a user unable to reach support.
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/api/v1/feedback', [
            'subject' => 'Pre-setup feedback',
            'description' => 'I tried registering and got stuck on the setup page.',
        ])
        ->assertStatus(202);

    Mail::assertSent(FeedbackMail::class, fn (FeedbackMail $mail): bool => $mail->userEmail === $user->email
            && $mail->academyId === null);
});
