<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Support\FiscalCode;

/**
 * A codice fiscale is stored in capitals with no spaces (#1934), however it
 * was typed, so the uniqueness check compares like with like. Blank is
 * nothing.
 */
trait NormalisesFiscalCode
{
    protected function normaliseFiscalCode(): void
    {
        $code = $this->input('fiscal_code');
        if (\is_string($code)) {
            $normalised = FiscalCode::normalise($code);
            $this->merge(['fiscal_code' => $normalised === '' ? null : $normalised]);
        }
    }
}
