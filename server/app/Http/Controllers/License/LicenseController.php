<?php

declare(strict_types=1);

namespace App\Http\Controllers\License;

use App\Actions\License\ActivateLicenseAction;
use App\Actions\License\GetLicenseStateAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\License\ActivateLicenseRequest;
use App\Http\Resources\LicenseResource;

/**
 * The licence surface of a desktop instance (#1290): read where you stand, and
 * activate a key. Gated by `capability:licensing`, so a hosted deployment —
 * which is licensed by whoever runs it, not by a pasted key — answers 404.
 */
class LicenseController extends Controller
{
    public function show(GetLicenseStateAction $state): LicenseResource
    {
        return new LicenseResource($state->execute());
    }

    public function store(ActivateLicenseRequest $request, ActivateLicenseAction $activate): LicenseResource
    {
        /** @var string $key */
        $key = $request->validated('key');

        return new LicenseResource($activate->execute($key));
    }
}
