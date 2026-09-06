<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Support\Import\AthleteColumnMap;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * The CSV upload behind the athlete import (#1346).
 *
 * Guards the same capability as the form it replaces —
 * `AthletesCreateUpdate`. Anyone who may add an athlete may add sixty; making
 * the bulk path more restrictive than the single one would be an arbitrary
 * rule to explain and no protection at all, since the same person can sit and
 * type them in.
 */
class ImportAthletesRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AthletesCreateUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // `mimetypes` rather than `mimes`: a CSV saved by Excel arrives as
            // text/plain about as often as text/csv, and rejecting on the
            // extension alone would turn a working file into an error nobody
            // can act on.
            'file' => ['required', 'file', 'max:2048', 'mimetypes:text/csv,text/plain,application/csv,application/vnd.ms-excel'],

            // Which column carries which field. Absent on the first call —
            // that is the point of the preview: the server guesses, shows its
            // guess, and this comes back filled in only if the guess was
            // wrong. The `array:` rule names the ONLY keys accepted, so a
            // typo'd field is refused here rather than silently ignored while
            // the column it names goes unread.
            'mapping' => ['sometimes', 'array:' . implode(',', AthleteColumnMap::FIELDS)],
            'mapping.*' => ['nullable', 'string', 'max:255'],

            // Defaults to a dry run, deliberately. A missing flag must never
            // be the one that writes sixty rows.
            'validate_only' => ['sometimes', 'boolean'],
        ];
    }

    /** Whether to write, as opposed to only report what writing would do. */
    public function isDryRun(): bool
    {
        return $this->boolean('validate_only', true);
    }

    /**
     * The mapping the caller supplied, with empty choices dropped.
     *
     * A column the user explicitly cleared arrives as `''`; keeping it would
     * make the import look for a header named "nothing" and find every cell
     * empty, which reads as "the file is broken" rather than "that field is
     * unmapped".
     *
     * @return array<string, string>
     */
    public function suppliedMapping(): array
    {
        /** @var array<string, mixed> $raw */
        $raw = $this->validated()['mapping'] ?? [];

        $mapping = [];
        foreach ($raw as $field => $header) {
            if (\is_string($header) && trim($header) !== '') {
                $mapping[(string) $field] = trim($header);
            }
        }

        return $mapping;
    }

    /** Match the wire-level 403 contract every other athlete write uses. */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
