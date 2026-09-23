<?php

declare(strict_types=1);

namespace App\Http\Requests\Syllabus;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Support\MartialArt\MartialArtProfile;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

/**
 * "Start from the programme" (#1563). The body names which starter programme
 * (#1800): optional when the academy's martial art offers exactly one, required
 * when it offers several — karate ships one per style, and guessing would put
 * one school's kata on another's page.
 */
class SeedSyllabusRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AcademySettingsUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $martialArt = $this->user()?->activeAcademy()?->martial_art;
        $offered = $martialArt === null ? [] : MartialArtProfile::for($martialArt)->programmes();

        return [
            'programme' => [\count($offered) > 1 ? 'required' : 'sometimes', 'string', Rule::in($offered)],
        ];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
