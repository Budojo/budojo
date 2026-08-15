<?php

declare(strict_types=1);

namespace App\Http\Controllers\Runtime;

use App\Http\Controllers\Controller;
use App\Http\Resources\RuntimeResource;
use App\Support\Runtime;

/**
 * `GET /api/v1/runtime` — the profile this API runs as and what it can do
 * (#1229). Public and unauthenticated on purpose: the SPA reads it before
 * anyone logs in, because the register and landing pages already differ
 * (no "athletes must be invited" copy on a runtime with no athlete accounts).
 */
class RuntimeController extends Controller
{
    public function __invoke(): RuntimeResource
    {
        return new RuntimeResource(Runtime::profile());
    }
}
