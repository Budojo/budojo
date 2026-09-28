<?php

declare(strict_types=1);

namespace App\Rules;

use App\Enums\AppLocale;
use App\Enums\Sex;
use App\Support\FiscalCode;
use App\Support\OperatorDay;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Validation\DataAwareRule;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * A codice fiscale that is well formed and agrees with the athlete (#1934).
 *
 * Well formed: shape, check character and a real date, omocodia accepted
 * (`FiscalCode`). Agrees: the date of birth and the sex the code encodes
 * match the ones in the same payload or, on an edit that does not send them,
 * the ones already stored. A disagreement is one error on the code that
 * names what the code says, because the code is the document and the
 * mistake is usually in the other field.
 *
 * One rule for every door a code comes in by — create, edit and the CSV
 * import — the way `StripesWithinGrade` is.
 *
 * It speaks the owner's language (#2006): the caller passes `users.locale`,
 * and the lines live in `lang/{en,it}/athletes.php`. They used to be English
 * whatever the owner read, in the form's banner.
 */
final class ItalianFiscalCode implements DataAwareRule, ValidationRule
{
    /** @var array<string, mixed> */
    private array $data = [];

    public function __construct(
        private readonly ?CarbonInterface $storedBirthDate = null,
        private readonly ?Sex $storedSex = null,
        private readonly AppLocale $locale = AppLocale::En,
    ) {
    }

    /** @param array<string, mixed> $data */
    public function setData(array $data): static
    {
        $this->data = $data;

        return $this;
    }

    public function validate(string $attribute, mixed $value, \Closure $fail): void
    {
        $code = \is_string($value) ? FiscalCode::parse($value) : null;
        if ($code === null) {
            $fail($this->line('invalid'));

            return;
        }

        $encoded = $code->birthDate(OperatorDay::today());
        $birthDate = $this->birthDate();
        if ($birthDate !== null && $birthDate !== $encoded->toDateString()) {
            $fail($this->line('birth_date', ['date' => $encoded->format('d/m/Y')]));
        }

        $sex = $this->sex();
        if ($sex !== null && $sex !== $code->sex) {
            $fail($this->line('sex', ['encoded' => $this->letter($code->sex), 'given' => $this->letter($sex)]));
        }
    }

    /** The payload's date when it sends one (even to clear it), else the stored one. */
    private function birthDate(): ?string
    {
        if (\array_key_exists('date_of_birth', $this->data)) {
            $sent = $this->data['date_of_birth'];

            return \is_string($sent) && strtotime($sent) !== false ? date('Y-m-d', (int) strtotime($sent)) : null;
        }

        return $this->storedBirthDate?->toDateString();
    }

    private function sex(): ?Sex
    {
        if (\array_key_exists('sex', $this->data)) {
            $sent = $this->data['sex'];

            return \is_string($sent) ? Sex::tryFrom($sent) : null;
        }

        return $this->storedSex;
    }

    /** @param array<string, string> $replace */
    private function line(string $key, array $replace = []): string
    {
        $line = __("athletes.fiscal_code.{$key}", $replace, $this->locale->value);

        return \is_string($line) ? $line : $key;
    }

    private function letter(Sex $sex): string
    {
        return mb_strtoupper($sex->value);
    }
}
