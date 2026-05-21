<?php

declare(strict_types=1);

namespace App\Support\Audit;

// Single redaction surface for audit-log before/after JSONs (#429).
class PiiRedactor
{
    /**
     * Fields that get the SHA-256 prefix treatment (8 hex chars + "..."):
     * enough to confirm a value changed without leaking the value itself.
     */
    private const HASHED_FIELDS = [
        'email',
        'phone_national_number',
        'phone_country_code',
    ];

    /**
     * Fields that get the partial-mask treatment (last 4 chars visible).
     * Italian regulator pattern for codice fiscale.
     */
    private const PARTIAL_MASK_FIELDS = [
        'fiscal_code',
        'codice_fiscale',
        'tax_id',
    ];

    /**
     * Fields stripped entirely — replaced with the literal '<redacted>'
     * string so the diff still SHOWS there was a value, just not WHAT.
     */
    private const OMITTED_FIELDS = [
        'address',
        'address_line_1',
        'address_line_2',
        'notes',
        'private_notes',
        'street',
    ];

    /**
     * @param array<string, mixed> $attributes
     * @return array<string, mixed>
     */
    public function redact(array $attributes): array
    {
        $redacted = [];
        foreach ($attributes as $key => $value) {
            $redacted[$key] = $this->redactValue($key, $value);
        }

        return $redacted;
    }

    private function redactValue(string $key, mixed $value): mixed
    {
        if ($value === null || $value === '') {
            return $value;
        }

        if (\in_array($key, self::HASHED_FIELDS, true) && \is_string($value)) {
            return mb_substr(hash('sha256', $value), 0, 8) . '...';
        }

        if (\in_array($key, self::PARTIAL_MASK_FIELDS, true) && \is_string($value)) {
            $tail = mb_substr($value, -4);

            return '***' . $tail;
        }

        if (\in_array($key, self::OMITTED_FIELDS, true)) {
            return '<redacted>';
        }

        return $value;
    }
}
