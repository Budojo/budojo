<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Storage::fake('public');
});

it('uploads an academy logo and returns the url', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $file = UploadedFile::fake()->image('logo.png', 256, 256);

    $response = $this->postJson('/api/v1/academy/logo', ['logo' => $file]);

    $response->assertOk()
        ->assertJsonStructure(['data' => ['id', 'name', 'logo_url']])
        ->assertJsonPath('data.id', $academy->id);

    $payload = $response->json('data');
    expect($payload['logo_url'])->toBeString();

    $academy->refresh();
    expect($academy->logo_path)->toBeString();
    Storage::disk('public')->assertExists($academy->logo_path);
});

it('replaces a previous logo and removes the old file', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $first = UploadedFile::fake()->image('first.png');
    $this->postJson('/api/v1/academy/logo', ['logo' => $first])->assertOk();
    $firstPath = $academy->refresh()->logo_path;

    $second = UploadedFile::fake()->image('second.png');
    $this->postJson('/api/v1/academy/logo', ['logo' => $second])->assertOk();
    $secondPath = $academy->refresh()->logo_path;

    expect($firstPath)->not->toBe($secondPath);
    Storage::disk('public')->assertExists($secondPath);
    Storage::disk('public')->assertMissing($firstPath);
});

it('rejects logo files larger than 2MB', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $tooBig = UploadedFile::fake()->image('huge.png')->size(2049);

    $this->postJson('/api/v1/academy/logo', ['logo' => $tooBig])
        ->assertStatus(422)
        ->assertJsonValidationErrors('logo');
});

it('rejects logo files with disallowed mime types', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $bad = UploadedFile::fake()->create('logo.pdf', 100, 'application/pdf');

    $this->postJson('/api/v1/academy/logo', ['logo' => $bad])
        ->assertStatus(422)
        ->assertJsonValidationErrors('logo');
});

it('forbids upload when the user has no academy', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $file = UploadedFile::fake()->image('logo.png');

    $this->postJson('/api/v1/academy/logo', ['logo' => $file])
        ->assertStatus(403);
});

it('removes the logo and clears the path', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $file = UploadedFile::fake()->image('logo.png');
    $this->postJson('/api/v1/academy/logo', ['logo' => $file])->assertOk();
    $path = $academy->refresh()->logo_path;
    expect($path)->toBeString();

    $this->deleteJson('/api/v1/academy/logo')
        ->assertOk()
        ->assertJsonPath('data.logo_url', null);

    expect($academy->refresh()->logo_path)->toBeNull();
    Storage::disk('public')->assertMissing($path);
});

it('returns 404 when deleting a logo without an academy', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $this->deleteJson('/api/v1/academy/logo')->assertStatus(404);
});

it('exposes logo_url as null when academy has no logo', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.logo_url', null);
});

it('strips script tags and on* attributes from uploaded SVG logos', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $malicious = <<<'SVG'
        <?xml version="1.0"?>
        <svg xmlns="http://www.w3.org/2000/svg" onload="alert('xss')" width="64" height="64">
          <script>alert('xss')</script>
          <rect width="64" height="64" fill="#5b6cff" onclick="alert('xss')"/>
          <a xlink:href="javascript:alert('xss')"><text>click</text></a>
        </svg>
        SVG;

    $file = UploadedFile::fake()->createWithContent('logo.svg', $malicious);

    $this->postJson('/api/v1/academy/logo', ['logo' => $file])->assertOk();

    $stored = Storage::disk('public')->get($academy->refresh()->logo_path);
    expect($stored)
        ->toBeString()
        ->not->toContain('<script')
        ->not->toContain('onload=')
        ->not->toContain('onclick=')
        ->not->toContain('javascript:');
});

// ─── #97 hardening — additional SVG attack vectors ────────────────────────────

/**
 * Helper: upload a malicious SVG and return the on-disk content after
 * sanitisation.
 */
function uploadMaliciousSvg(string $svg): string
{
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $file = UploadedFile::fake()->createWithContent('logo.svg', $svg);
    test()->postJson('/api/v1/academy/logo', ['logo' => $file])->assertOk();

    $stored = Storage::disk('public')->get($academy->refresh()->logo_path);
    expect($stored)->toBeString();

    return (string) $stored;
}

it('strips <embed>, <object>, <link>, and <meta> elements (#97)', function (): void {
    $stored = uploadMaliciousSvg(<<<'SVG'
        <?xml version="1.0"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
          <embed src="javascript:alert('xss')"/>
          <object data="evil.html"></object>
          <link rel="stylesheet" href="evil.css"/>
          <meta http-equiv="refresh" content="0;url=javascript:alert('xss')"/>
          <rect width="64" height="64" fill="#5b6cff"/>
        </svg>
        SVG);

    expect($stored)
        ->not->toContain('<embed')
        ->not->toContain('<object')
        ->not->toContain('<link')
        ->not->toContain('<meta')
        ->toContain('<rect'); // benign content survives
});

it('strips animation elements that target href/xlink:href (#97)', function (): void {
    $stored = uploadMaliciousSvg(<<<'SVG'
        <?xml version="1.0"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
          <a href="#safe">
            <animate attributeName="href" to="javascript:alert(1)" begin="0s" dur="0.1s"/>
            <set attributeName="xlink:href" to="javascript:alert(2)"/>
            <text>click</text>
          </a>
          <rect>
            <animate attributeName="fill" to="#ff0000"/>
          </rect>
        </svg>
        SVG);

    expect($stored)
        // The two animation elements that mutate href ARE removed.
        ->not->toContain('attributeName="href"')
        ->not->toContain('attributeName="xlink:href"')
        // A benign animation that mutates fill is left alone.
        ->toContain('attributeName="fill"');
});

it('strips <use> elements with cross-document hrefs but keeps same-document refs (#97)', function (): void {
    $stored = uploadMaliciousSvg(<<<'SVG'
        <?xml version="1.0"?>
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64">
          <defs><circle id="dot" r="4"/></defs>
          <use href="https://evil.example/payload.svg" x="10" y="10"/>
          <use xlink:href="https://evil.example/payload.svg" x="20" y="10"/>
          <use href="#dot" x="30" y="10"/>
        </svg>
        SVG);

    expect($stored)
        ->not->toContain('evil.example')
        // Same-document anchor refs survive — that's how SVG <defs> works.
        ->toContain('href="#dot"');
});

it('blocks percent-encoded and entity-encoded javascript: URIs (#97)', function (): void {
    $stored = uploadMaliciousSvg(<<<'SVG'
        <?xml version="1.0"?>
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64">
          <a href="%6Aavascript:alert('pct')"><text>pct</text></a>
          <a xlink:href="&#106;avascript:alert('ent')"><text>ent</text></a>
          <a href="  &#x09;javascript:alert('ws')"><text>ws</text></a>
        </svg>
        SVG);

    // After percent-decoding, entity-decoding, and whitespace stripping,
    // each value resolves to "javascript:..." and the attribute is gone.
    // The anchor element itself stays (it's harmless without a hyperlink),
    // but the dangerous `href` is removed. Assert against EACH encoded
    // form explicitly so a regression that bypasses one decoder branch
    // (e.g. dropping the `rawurldecode()` step) actually fails the test —
    // the literal `javascript:` check alone would pass even if
    // `%6Aavascript:` survived in the output.
    expect($stored)
        ->not->toContain('javascript:')
        ->not->toContain('%6Aavascript:')
        ->not->toContain('&#106;avascript:')
        ->not->toMatch('/href="[^"]*[Jj]avascript/');
});

it('does not expand DOCTYPE entities at parse time (XXE defence — #97)', function (): void {
    // Without `LIBXML_NOENT`, libxml leaves the entity reference literal
    // (`&pwned;` survives as text); with that flag set, the parser would
    // SUBSTITUTE the value at parse time and a `<!ENTITY xxe SYSTEM
    // "file:///etc/passwd">` would expand into the DOM, which we'd then
    // serialise back into the public-disk file. `LIBXML_NONET` only
    // blocks network entities, not local `file://` — the only safe shape
    // is to not expand entities at all.
    //
    // Test uses an inline entity (no network/file dependency) so it works
    // in any environment: if expansion happens, the literal payload would
    // appear in the saved output; if not, only `&pwned;` survives.
    $stored = uploadMaliciousSvg(<<<'SVG'
        <?xml version="1.0"?>
        <!DOCTYPE svg [<!ENTITY pwned "PWNED-XXE-SECRET-PAYLOAD">]>
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
          <text>&pwned;</text>
        </svg>
        SVG);

    expect($stored)->not->toContain('PWNED-XXE-SECRET-PAYLOAD');
});

it('blocks vbscript: and data:text/html URIs alongside javascript: (#97)', function (): void {
    $stored = uploadMaliciousSvg(<<<'SVG'
        <?xml version="1.0"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
          <a href="vbscript:msgbox('xss')"><text>vb</text></a>
          <a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgpPC9zY3JpcHQ+"><text>data</text></a>
        </svg>
        SVG);

    expect($stored)
        ->not->toContain('vbscript:')
        ->not->toContain('data:text/html');
});
