<?php

declare(strict_types=1);

namespace App\Http\Requests\AcademyClosure;

use App\Authorization\Capability;
use App\Models\AcademyClosure;

/** Editing a closure (#1766): the same range rules, on the closure's own academy. */
class UpdateAcademyClosureRequest extends StoreAcademyClosureRequest
{
    public function authorize(): bool
    {
        $closure = $this->route('closure');
        if (! $closure instanceof AcademyClosure) {
            return false;
        }

        return $this->authorizeInAcademy($closure->academy_id, Capability::AcademySettingsUpdate);
    }
}
