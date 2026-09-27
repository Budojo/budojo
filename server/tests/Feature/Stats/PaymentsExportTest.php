<?php

declare(strict_types=1);

use App\Enums\AppLocale;
use App\Enums\BillingPeriod;
use App\Enums\PaymentMethod;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\Carnet;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * A season of payments, handed to the accountant as a file (#1762).
 *
 * The fixture is the issue's: a September-start academy, one quarterly fee
 * and one carnet in 2026/27, and a fee from the season before that must not
 * be in the file. Bounding by calendar year instead of the season moves the
 * August fee in and fails the exact body.
 */
afterEach(function (): void {
    CarbonImmutable::setTestNow(null);
});

const EXPORT_HEADER_IT = "Data;Tipo;Atleta;Importo;Valuta;\"Mesi o ingressi\";Metodo;Periodo;Codice\r\n";

function exportAcademy(AppLocale $locale = AppLocale::It): User
{
    CarbonImmutable::setTestNow(CarbonImmutable::create(2026, 10, 10, 12));

    $user = userWithAcademy();
    $user->update(['locale' => $locale]);
    $user->academy->update(['season_start_month' => 9]);

    $marco = Athlete::factory()->for($user->academy)->create(['first_name' => 'Marco', 'last_name' => 'Rossi']);
    $luca = Athlete::factory()->for($user->academy)->create(['first_name' => 'Luca', 'last_name' => 'Bianchi']);

    // The season before: paid on 20 August, so outside 2026/27.
    AthletePayment::factory()->for($marco)->create([
        'year' => 2026, 'month' => 8, 'period_months' => BillingPeriod::Monthly,
        'amount_cents' => 5500, 'paid_at' => '2026-08-20 00:00:00',
    ]);
    // A quarterly fee, September to November, paid in cash.
    AthletePayment::factory()->for($marco)->create([
        'year' => 2026, 'month' => 9, 'period_months' => BillingPeriod::Quarterly,
        'amount_cents' => 16500, 'paid_at' => '2026-09-03 00:00:00', 'payment_method' => PaymentMethod::Cash,
    ]);
    Carnet::factory()->for($luca)->create([
        'code' => 'A7K2', 'total_entries' => 10, 'price_cents' => 7000,
        'purchased_at' => '2026-09-11', 'valid_from' => '2026-09-11', 'expires_at' => '2027-09-11',
        'payment_method' => PaymentMethod::Transfer,
    ]);

    return $user;
}

it('hands over the season as a csv, oldest first, fees and carnets together', function (): void {
    $user = exportAcademy();

    $response = $this->actingAs($user)->get('/api/v1/stats/payments/export?season=2026');

    $response->assertOk()
        ->assertHeader('Content-Type', 'text/csv; charset=utf-8')
        ->assertDownload('budojo-payments-2026-27.csv');
    expect($response->streamedContent())->toBe(
        "\xEF\xBB\xBF"
        . EXPORT_HEADER_IT
        . "03/09/2026;Quota;\"Rossi Marco\";165,00;EUR;3;Contanti;\"set 2026 – nov 2026\";\r\n"
        . "11/09/2026;Carnet;\"Bianchi Luca\";70,00;EUR;10;Bonifico;\"11/09/2026 – 11/09/2027\";A7K2\r\n",
    );
});

it("speaks the owner's language", function (): void {
    $user = exportAcademy(AppLocale::En);

    $body = $this->actingAs($user)->get('/api/v1/stats/payments/export?season=2026')->streamedContent();

    expect($body)->toContain("Date;Type;Athlete;Amount;Currency;\"Months or entries\";Method;Covers;Code\r\n")
        ->and($body)->toContain("03/09/2026;Fee;\"Rossi Marco\";165,00;EUR;3;Cash;\"Sep 2026 – Nov 2026\";\r\n")
        ->and($body)->toContain(';Carnet;"Bianchi Luca";70,00;EUR;10;"Bank transfer";');
});

it('reads the season from the academy, not the calendar year', function (): void {
    $user = exportAcademy();

    // 2025/26 runs to 31 August 2026: the August fee is in it, September's are not.
    $body = $this->actingAs($user)->get('/api/v1/stats/payments/export?season=2025')->streamedContent();

    expect($body)->toContain("20/08/2026;Quota;\"Rossi Marco\";55,00;EUR;1;;\"ago 2026\";\r\n")
        ->and($body)->not->toContain('03/09/2026')
        ->and($body)->not->toContain('A7K2');
});

it('defaults to the season the owner is in today', function (): void {
    $user = exportAcademy();

    $this->actingAs($user)->get('/api/v1/stats/payments/export')
        ->assertOk()
        ->assertDownload('budojo-payments-2026-27.csv');
});

it('answers an empty season with the header alone, not a 404', function (): void {
    $user = exportAcademy();

    $body = $this->actingAs($user)->get('/api/v1/stats/payments/export?season=2020')->streamedContent();

    expect($body)->toBe("\xEF\xBB\xBF" . EXPORT_HEADER_IT);
});

it('keeps the money of an athlete who has since been deleted', function (): void {
    $user = exportAcademy();
    Athlete::query()->where('last_name', 'Rossi')->firstOrFail()->delete();

    $body = $this->actingAs($user)->get('/api/v1/stats/payments/export?season=2026')->streamedContent();

    // The money came in; removing the athlete later does not un-collect it.
    expect($body)->toContain('"Rossi Marco";165,00');
});

it("carries only this academy's money", function (): void {
    $user = exportAcademy();
    $other = userWithAcademy();
    $stranger = Athlete::factory()->for($other->academy)->create(['first_name' => 'Anna', 'last_name' => 'Altri']);
    AthletePayment::factory()->for($stranger)->create([
        'year' => 2026, 'month' => 9, 'amount_cents' => 9900, 'paid_at' => '2026-09-05 00:00:00',
    ]);

    $body = $this->actingAs($user)->get('/api/v1/stats/payments/export?season=2026')->streamedContent();

    expect($body)->not->toContain('Altri');
});

it('never hands Excel a formula in a name', function (): void {
    $user = exportAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['first_name' => 'x', 'last_name' => '=HYPERLINK("http://evil")']);
    AthletePayment::factory()->for($athlete)->create([
        'year' => 2026, 'month' => 10, 'amount_cents' => 5500, 'paid_at' => '2026-10-01 00:00:00',
    ]);

    $body = $this->actingAs($user)->get('/api/v1/stats/payments/export?season=2026')->streamedContent();

    expect($body)->toContain(";\"'=HYPERLINK(\"\"http://evil\"\") x\";")
        ->and($body)->not->toContain(';"=HYPERLINK');
});

it("dates a payment recorded late at night on the owner's day", function (): void {
    $user = exportAcademy();
    $marco = Athlete::query()->where('last_name', 'Rossi')->firstOrFail();
    // Before #1761 a payment held the moment it was recorded: 23:30 UTC on
    // 31 August was already 1 September in Rome, and is this season's money.
    AthletePayment::factory()->for($marco)->create([
        'year' => 2026, 'month' => 12, 'amount_cents' => 5500, 'paid_at' => '2026-08-31 23:30:00',
    ]);

    $body = $this->actingAs($user)->get('/api/v1/stats/payments/export?season=2026')->streamedContent();

    expect($body)->toContain('01/09/2026;Quota;"Rossi Marco";55,00');
});

it('refuses a season outside the plausible range', function (): void {
    $user = exportAcademy();

    $this->actingAs($user)->getJson('/api/v1/stats/payments/export?season=1999')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['season']);
});

it('is behind authentication', function (): void {
    $this->getJson('/api/v1/stats/payments/export')->assertUnauthorized();
});
