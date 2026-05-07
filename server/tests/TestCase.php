<?php

declare(strict_types=1);

namespace Tests;

use App\Services\PwnedPasswordsClient;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Bind a "no breach" `PwnedPasswordsClient` for every test by
     * default (#415). Without this, every feature test that hits a
     * password-validation rule (register / reset / change-password /
     * invite-accept) would either:
     *
     * - Block on a real HIBP HTTP call (no network in CI; flaky), OR
     * - Fail with `password_breached` on whatever throwaway password
     *   the spec used (e.g. "Password1!" appears in the breach
     *   dataset and would silently 422 every test).
     *
     * Specs that want to exercise the breach-detected path swap the
     * binding via `$this->app->instance(PwnedPasswordsClient::class, …)`
     * with a `->shouldReceive('isPwned')->andReturn(true)` mock.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->app->instance(
            PwnedPasswordsClient::class,
            new class () extends PwnedPasswordsClient {
                public function __construct()
                {
                    // Skip the parent constructor — we override the only
                    // method that uses the HTTP factory below.
                }

                public function isPwned(string $password): bool
                {
                    return false;
                }
            },
        );
    }
}
