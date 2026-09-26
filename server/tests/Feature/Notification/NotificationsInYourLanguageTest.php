<?php

declare(strict_types=1);

use App\Enums\AppLocale;
use App\Enums\DocumentType;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\User;
use App\Notifications\OwnerAcademyDocumentExpiringNotification;
use App\Notifications\OwnerAthleteMissedStreakNotification;
use App\Notifications\OwnerMedicalCertExpiringDigestNotification;
use App\Notifications\OwnerUnpaidAthletesDigestNotification;
use App\Support\NotificationText;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;

/**
 * #1912 — the owner's notifications were English on an Italian app, in the
 * inbox and in the Windows notification alike: every row stored a sentence
 * written in English the moment it was created. Rows store their parameters
 * now, and both readers write the sentence in the owner's language.
 */
beforeEach(function (): void {
    Carbon::setTestNow('2026-09-16 10:00:00');
    $this->owner = userWithAcademy();
    $this->academy = $this->owner->academy;
});

afterEach(fn () => Carbon::setTestNow());

/**
 * The row a notification writes to the inbox, without sending it anywhere
 * else: the missed-streak alert also goes out by web push, which has no keys
 * under test.
 */
function storeFor(User $user, \Illuminate\Notifications\Notification $notification): void
{
    /** @var array<string, mixed> $data */
    $data = $notification->toDatabase($user);
    $user->notifications()->create(['id' => (string) Str::uuid(), 'type' => $notification::class, 'data' => $data]);
}

/** @param list<string> $names */
function athletesNamed(Academy $academy, array $names): \Illuminate\Support\Collection
{
    return collect($names)->map(function (string $full) use ($academy): Athlete {
        [$first, $last] = explode(' ', $full, 2);

        return Athlete::factory()->for($academy)->create(['first_name' => $first, 'last_name' => $last]);
    });
}

// ─── The renderer ────────────────────────────────────────────────────────────

it('writes the missed-streak alert in either language', function (): void {
    $data = ['kind' => 'owner_athlete_missed_streak', 'params' => ['name' => 'Giorgi Giorgio', 'count' => 3]];

    expect(NotificationText::of($data, 'it'))->toBe([
        'title' => "Giorgi Giorgio non si allena da un po'",
        'body' => 'Ha saltato gli ultimi 3 allenamenti in programma.',
    ])->and(NotificationText::of($data, 'en'))->toBe([
        'title' => "Giorgi Giorgio hasn't trained in a while",
        'body' => 'Missed the last 3 scheduled trainings.',
    ]);
});

it('names the month an unpaid digest is about, and counts in the language', function (): void {
    $one = ['kind' => 'unpaid_athletes_digest', 'params' => ['count' => 1, 'names' => ['Anna Bianchi'], 'more' => 0, 'year' => 2026, 'month' => 9]];
    $six = ['kind' => 'unpaid_athletes_digest', 'params' => ['count' => 6, 'names' => ['Dario Ascanio', 'Elizabeth Linares', 'Samuele Bruni'], 'more' => 3, 'year' => 2026, 'month' => 9]];

    // "This month" is wrong the day the month is over; the month is not.
    expect(NotificationText::of($one, 'it'))->toBe([
        'title' => 'Un atleta non ha ancora pagato la quota di settembre',
        'body' => 'Anna Bianchi',
    ])->and(NotificationText::of($six, 'it'))->toBe([
        'title' => '6 atleti non hanno ancora pagato la quota di settembre',
        'body' => 'Dario Ascanio, Elizabeth Linares, Samuele Bruni e altri 3',
    ])->and(NotificationText::of($six, 'en'))->toBe([
        'title' => "6 athletes haven't paid September's fee yet",
        'body' => 'Dario Ascanio, Elizabeth Linares, Samuele Bruni and 3 more',
    ]);
});

it('writes both expiry digests in the language', function (): void {
    $medical = ['kind' => 'medical_cert_expiry_reminders', 'params' => ['count' => 2, 'names' => ['Mario Rossi', 'Anna Bianchi'], 'more' => 0]];
    $papers = ['kind' => 'academy_document_expiry_reminders', 'params' => ['count' => 1, 'documents' => [['name' => 'Assicurazione.pdf', 'expires_on' => '2026-10-01']]]];

    expect(NotificationText::of($medical, 'it'))->toBe([
        'title' => '2 certificati medici stanno per scadere',
        'body' => 'Mario Rossi, Anna Bianchi',
    ])->and(NotificationText::of($papers, 'it'))->toBe([
        'title' => "Un documento dell'accademia sta per scadere",
        'body' => 'Assicurazione.pdf, scade il 1 ottobre 2026',
    ])->and(NotificationText::of($papers, 'en'))->toBe([
        'title' => "One of the academy's documents is expiring",
        'body' => 'Assicurazione.pdf, expires 1 October 2026',
    ]);
});

it('shows a document name alone when its expiry is not a date', function (): void {
    $papers = ['kind' => 'academy_document_expiry_reminders', 'params' => ['count' => 2, 'documents' => [
        ['name' => 'Assicurazione.pdf', 'expires_on' => 'soon'],
        ['name' => 'Affitto.pdf', 'expires_on' => '2026-13-45'],
    ]]];

    expect(NotificationText::of($papers, 'it')['body'])->toBe("Assicurazione.pdf\nAffitto.pdf");
});

it('falls back to the stored sentence for a kind it does not write', function (): void {
    $data = ['kind' => 'community_new_post', 'title' => 'Stored title', 'body' => 'Stored body'];

    expect(NotificationText::of($data, 'it'))->toBe(['title' => 'Stored title', 'body' => 'Stored body']);
});

it('falls back to the stored sentence when the parameters are not all there', function (): void {
    $data = ['kind' => 'owner_athlete_missed_streak', 'params' => ['count' => 3], 'title' => 'Old', 'body' => 'Old body'];

    expect(NotificationText::of($data, 'it'))->toBe(['title' => 'Old', 'body' => 'Old body']);
});

// ─── What the notifications store ────────────────────────────────────────────

it('stores the parameters on every owner digest and alert', function (): void {
    $athletes = athletesNamed($this->academy, ['Giorgi Giorgio']);
    $document = Document::factory()->create([
        'athlete_id' => $athletes->first()->id,
        'type' => DocumentType::MedicalCertificate,
        'expires_at' => '2026-09-23',
    ]);
    $paper = Document::factory()->create([
        'athlete_id' => null,
        'academy_id' => $this->academy->id,
        'type' => DocumentType::IdCard,
        'original_name' => 'Assicurazione.pdf',
        'expires_at' => '2026-10-01',
    ]);

    storeFor($this->owner, new OwnerAthleteMissedStreakNotification($athletes->first(), 3));
    storeFor($this->owner, new OwnerUnpaidAthletesDigestNotification($this->academy, $athletes, 2026, 9));
    storeFor($this->owner, new OwnerMedicalCertExpiringDigestNotification($this->academy, new EloquentCollection([$document->load('athlete')])));
    storeFor($this->owner, new OwnerAcademyDocumentExpiringNotification($this->academy, new EloquentCollection([$paper])));

    $params = $this->owner->notifications()->get()
        ->mapWithKeys(fn (DatabaseNotification $n): array => [(string) $n->data['kind'] => $n->data['params'] ?? null]);

    expect($params['owner_athlete_missed_streak'])->toBe(['name' => 'Giorgi Giorgio', 'count' => 3])
        ->and($params['unpaid_athletes_digest'])->toBe(['count' => 1, 'names' => ['Giorgi Giorgio'], 'more' => 0, 'year' => 2026, 'month' => 9])
        ->and($params['medical_cert_expiry_reminders'])->toBe(['count' => 1, 'names' => ['Giorgi Giorgio'], 'more' => 0])
        ->and($params['academy_document_expiry_reminders'])->toBe(['count' => 1, 'documents' => [['name' => 'Assicurazione.pdf', 'expires_on' => '2026-10-01']]]);
});

// ─── Both readers ────────────────────────────────────────────────────────────

it('serves the inbox in the owner language', function (): void {
    $this->owner->update(['locale' => 'it']);
    storeFor($this->owner, new OwnerAthleteMissedStreakNotification(athletesNamed($this->academy, ['Giorgi Giorgio'])->first(), 3));

    $row = $this->actingAs($this->owner)->getJson('/api/v1/me/notifications')->assertOk()->json('data.0');

    expect($row['title'])->toBe("Giorgi Giorgio non si allena da un po'")
        ->and($row['body'])->toBe('Ha saltato gli ultimi 3 allenamenti in programma.');
});

it('serves the inbox in English to an owner who never chose', function (): void {
    storeFor($this->owner, new OwnerAthleteMissedStreakNotification(athletesNamed($this->academy, ['Giorgi Giorgio'])->first(), 3));

    expect($this->actingAs($this->owner)->getJson('/api/v1/me/notifications')->json('data.0.title'))
        ->toBe("Giorgi Giorgio hasn't trained in a while");
});

it('hands the Windows notification the same sentence the inbox shows', function (): void {
    config()->set('budojo.runtime', 'desktop');
    $this->owner->update(['locale' => 'it']);
    storeFor($this->owner, new OwnerAthleteMissedStreakNotification(athletesNamed($this->academy, ['Giorgi Giorgio'])->first(), 3));

    Artisan::call('budojo:list-desktop-notifications', ['--after' => '2026-09-01T00:00:00+00:00']);
    $rows = json_decode(Artisan::output(), true, 512, JSON_THROW_ON_ERROR);

    expect($rows[0]['title'])->toBe("Giorgi Giorgio non si allena da un po'")
        ->and($rows[0]['body'])->toBe('Ha saltato gli ultimi 3 allenamenti in programma.');
});

// ─── The language the server is told ─────────────────────────────────────────

it('takes the app language and sends it back on the user', function (): void {
    $this->actingAs($this->owner)->patchJson('/api/v1/me/locale', ['locale' => 'it'])
        ->assertOk()->assertJsonPath('data.locale', 'it');

    expect($this->owner->fresh()->locale)->toBe(AppLocale::It);
    $this->actingAs($this->owner)->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.locale', 'it');
});

it('refuses a language the app does not speak', function (): void {
    $this->actingAs($this->owner)->patchJson('/api/v1/me/locale', ['locale' => 'fr'])
        ->assertUnprocessable()->assertJsonValidationErrors(['locale']);
    $this->actingAs($this->owner)->patchJson('/api/v1/me/locale', [])
        ->assertUnprocessable()->assertJsonValidationErrors(['locale']);
});

// ─── The rows already in inboxes ─────────────────────────────────────────────

it('gives the rows already in an inbox their parameters', function (): void {
    $legacy = [
        ['kind' => 'owner_athlete_missed_streak', 'title' => "Giorgi Giorgio hasn't trained in a while", 'body' => 'Missed the last 3 scheduled trainings.', 'link' => '/dashboard/athletes/7', 'athlete_id' => 7, 'consecutive' => 3],
        ['kind' => 'unpaid_athletes_digest', 'title' => '6 athletes have not paid this month', 'body' => 'Dario Ascanio, Elizabeth Myriam Ayca Linares, Samuele Bruni and 3 more', 'link' => '/dashboard/athletes?paid=no', 'academy_id' => 1, 'year' => 2026, 'month' => 9],
        ['kind' => 'unpaid_athletes_digest', 'title' => '1 athlete has not paid this month', 'body' => 'Anna Bianchi', 'link' => '/dashboard/athletes?paid=no', 'academy_id' => 1, 'year' => 2026, 'month' => 8],
        ['kind' => 'medical_cert_expiry_reminders', 'title' => '2 medical certificates are expiring', 'body' => 'Mario Rossi, Anna Bianchi', 'link' => '/dashboard/documents/expiring', 'academy_id' => 1, 'document_ids' => [3, 4]],
        ['kind' => 'academy_document_expiry_reminders', 'title' => "One of the academy's documents is expiring", 'body' => 'Assicurazione.pdf — 2026-10-01', 'link' => '/dashboard/documents/expiring', 'academy_id' => 1, 'document_ids' => [9]],
    ];
    foreach ($legacy as $data) {
        $this->owner->notifications()->create(['id' => (string) Str::uuid(), 'type' => 'legacy', 'data' => $data]);
        // A second apart, so the read-back below comes out in this order.
        $this->travel(1)->seconds();
    }

    (require database_path('migrations/2026_09_26_160000_give_owner_notifications_their_parameters.php'))->up();

    // `notifications()` sorts newest first; the rows are read back oldest first.
    $texts = $this->owner->notifications()->reorder('created_at')->get()
        ->map(fn (DatabaseNotification $n): array => NotificationText::of($n->data, 'it'))
        ->all();

    expect($texts)->toBe([
        ['title' => "Giorgi Giorgio non si allena da un po'", 'body' => 'Ha saltato gli ultimi 3 allenamenti in programma.'],
        ['title' => '6 atleti non hanno ancora pagato la quota di settembre', 'body' => 'Dario Ascanio, Elizabeth Myriam Ayca Linares, Samuele Bruni e altri 3'],
        ['title' => 'Un atleta non ha ancora pagato la quota di agosto', 'body' => 'Anna Bianchi'],
        ['title' => '2 certificati medici stanno per scadere', 'body' => 'Mario Rossi, Anna Bianchi'],
        ['title' => "Un documento dell'accademia sta per scadere", 'body' => 'Assicurazione.pdf, scade il 1 ottobre 2026'],
    ]);
});

it('leaves a row it cannot read as it was', function (): void {
    $this->owner->notifications()->create(['id' => (string) Str::uuid(), 'type' => 'legacy', 'data' => [
        'kind' => 'owner_athlete_missed_streak', 'title' => 'Something else entirely', 'body' => 'b', 'consecutive' => 3,
    ]]);

    (require database_path('migrations/2026_09_26_160000_give_owner_notifications_their_parameters.php'))->up();

    $data = $this->owner->notifications()->firstOrFail()->data;
    expect($data)->not->toHaveKey('params')
        ->and(NotificationText::of($data, 'it')['title'])->toBe('Something else entirely');
});
