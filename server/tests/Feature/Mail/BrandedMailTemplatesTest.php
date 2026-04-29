<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Facades\Notification;

/*
 * Branded transactional mail templates (#180).
 *
 * The Laravel Markdown mailer reads its layout from
 * `resources/views/vendor/mail/html/*.blade.php` (with the framework's
 * bundled defaults at `vendor/laravel/framework/src/Illuminate/Mail/.../html/`
 * as the fallback). When we publish + customize the vendor templates,
 * every notification using `MailMessage` (verify-email today, password
 * reset tomorrow, payment receipt in M5) inherits the Budojo branding
 * automatically — no per-notification class changes needed.
 *
 * These tests pin two contracts:
 *
 *   1. The customized vendor template files are present on disk.
 *      Squash-merging or a stale rebase could silently delete them
 *      and the email would fall back to the framework default ("Laravel"
 *      wordmark + Material blue). The assertion catches that regression
 *      before it ships.
 *   2. The verify-email notification, when rendered through the mail
 *      pipeline, surfaces the Budojo wordmark + indigo accent in the
 *      output HTML. End-to-end check that the customization actually
 *      reaches the email body.
 */

it('publishes the Budojo-branded vendor mail header + footer + theme files', function (): void {
    $base = base_path('resources/views/vendor/mail/html');

    expect(file_exists("{$base}/header.blade.php"))->toBeTrue('mail header is published');
    expect(file_exists("{$base}/footer.blade.php"))->toBeTrue('mail footer is published');
    expect(file_exists("{$base}/themes/default.css"))->toBeTrue('mail theme css is published');

    expect(file_get_contents("{$base}/header.blade.php"))->toContain('Budojo');
    expect(file_get_contents("{$base}/footer.blade.php"))->toContain('Budojo');
    expect(file_get_contents("{$base}/themes/default.css"))->toContain('#5b6cff');
});

it('renders the verify-email body with the Budojo wordmark + indigo button', function (): void {
    Notification::fake();

    $user = User::factory()->unverified()->create();
    $user->sendEmailVerificationNotification();

    Notification::assertSentTo(
        $user,
        VerifyEmail::class,
        // Assert directly on the rendered HTML so the published vendor
        // templates are exercised end-to-end (not just file existence).
        function (VerifyEmail $notification) use ($user) {
            $message = $notification->toMail($user);
            // `render()` returns `Illuminate\Support\HtmlString`; cast to
            // a plain string so Pest's `toContain` (which calls
            // `assertStringContainsString` on string haystacks) gets the
            // type it expects without the HtmlString wrapper.
            $rendered = (string) $message->render();

            // Budojo wordmark from the published header.blade.php +
            // indigo accent from themes/default.css inlined by the
            // premailer.
            expect($rendered)
                ->toContain('Budojo')
                ->toContain('#5b6cff');

            return true;
        },
    );
});
