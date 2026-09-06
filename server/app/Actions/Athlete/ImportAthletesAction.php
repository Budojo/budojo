<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Actions\Address\AddressIntent;
use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use App\Support\AthleteFieldRules;
use App\Support\Import\AthleteCsv;
use App\Support\Import\BeltText;
use App\Support\Import\DateText;
use App\Support\Import\PhoneText;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * Import a roster from a CSV (#1346).
 *
 * The thing standing between installing Budojo and getting any value out of it
 * is sixty trips through the "new athlete" form. This is that, once.
 *
 * **It creates athletes the same way the form does** — through
 * `CreateAthleteAction`, which is exactly the future its docblock named. Not
 * because the code is prettier that way, but because writing rows straight
 * into SQLite would skip the observers, the academy counters and the audit
 * trail, and produce a roster subtly unlike one typed in by hand. The bugs
 * from that surface weeks later and never look like an import problem.
 *
 * **Every row is validated against `AthleteFieldRules`** — the same definition
 * of a valid athlete the form uses, so a rule added there cannot silently skip
 * the path that creates sixty records at once.
 *
 * **The dry run is the product, not a debug flag.** A file's dates are
 * ambiguous (`03/04/2019`), its belts are in another language, and its columns
 * are named by whoever made the sheet. No parser resolves that reliably; what
 * resolves it is showing the owner exactly what would be written, and letting
 * them look, before anything is.
 */
final class ImportAthletesAction
{
    /**
     * A file bigger than this is not a dojo's roster; it is a mistake or an
     * attack, and either way the honest answer is a message rather than a
     * request that runs for a minute and then times out.
     */
    public const MAX_ROWS = 2000;

    public function __construct(
        private readonly CreateAthleteAction $create,
    ) {
    }

    /**
     * @param array<string, string> $map     field => the header name carrying it
     * @param bool                  $dryRun  true = validate everything, write nothing
     *
     * @return array{imported: int, skipped: int, rows: list<array{row: int, status: string, values: array<string, mixed>, errors: array<string, list<string>>}>}
     */
    public function execute(Academy $academy, AthleteCsv $csv, array $map, bool $dryRun): array
    {
        /** @var list<array{row: int, status: string, values: array<string, mixed>, errors: array<string, list<string>>}> $rows */
        $rows = [];

        // Names already accounted for: the ones the academy has, plus the ones
        // earlier rows of THIS file would create. Without the second half, a
        // sheet listing the same person twice imports them twice — and a file
        // assembled from two registers usually does.
        $seen = $this->existingPeople($academy);

        foreach ($csv->rows as $row) {
            $values = $this->valuesFor($csv->keyed($row['cells']), $map, $academy);
            $errors = $this->errorsFor($values, $academy);

            if ($errors !== []) {
                $rows[] = ['row' => $row['number'], 'status' => 'invalid', 'values' => $values, 'errors' => $errors];

                continue;
            }

            $person = $this->identityOf($values);
            if ($this->alreadyPresent($person, $seen)) {
                $rows[] = ['row' => $row['number'], 'status' => 'duplicate', 'values' => $values, 'errors' => []];

                continue;
            }

            $seen[] = $person;
            $rows[] = ['row' => $row['number'], 'status' => 'ok', 'values' => $values, 'errors' => []];
        }

        if (! $dryRun) {
            $this->write($academy, $rows);
        }

        return [
            'imported' => \count(array_filter($rows, static fn (array $r): bool => $r['status'] === 'ok')),
            'skipped' => \count(array_filter($rows, static fn (array $r): bool => $r['status'] !== 'ok')),
            'rows' => $rows,
        ];
    }

    /**
     * One transaction for the whole file.
     *
     * Half an import is the worst outcome available: the owner cannot tell
     * which rows landed without reading the roster against the sheet, and
     * re-running would duplicate whatever did. All or nothing is the only
     * state that is recoverable by pressing the button again.
     *
     * @param list<array{row: int, status: string, values: array<string, mixed>, errors: array<string, list<string>>}> $rows
     */
    private function write(Academy $academy, array $rows): void
    {
        DB::transaction(function () use ($academy, $rows): void {
            foreach ($rows as $row) {
                if ($row['status'] !== 'ok') {
                    continue;
                }

                $this->create->execute($academy, $row['values'], AddressIntent::skip());
            }
        });
    }

    /**
     * The cells of one row, turned into the payload `CreateAthleteAction` takes.
     *
     * Defaults live here rather than in the parsers: a sheet that carries no
     * `status` column means every athlete on it is active, and one with no
     * joining date means "they train here now". Both are true statements about
     * the file, and neither is the parser's business.
     *
     * @param array<string, string> $cells
     * @param array<string, string> $map
     *
     * @return array<string, mixed>
     */
    private function valuesFor(array $cells, array $map, Academy $academy): array
    {
        $cell = static fn (string $field): string => trim($cells[$map[$field] ?? ''] ?? '');

        $values = [
            'first_name' => $cell('first_name'),
            'last_name' => $cell('last_name'),
            'belt' => BeltText::parse($cell('belt'))?->value,
            'stripes' => ctype_digit($cell('stripes')) ? (int) $cell('stripes') : 0,
            'status' => $this->statusFor($cell('status')),
            'joined_at' => DateText::parse($cell('joined_at'))?->toDateString() ?? now()->toDateString(),
        ];

        // Optional fields are only sent when the sheet actually carries them.
        // Writing `null` instead would be the same thing today and a different
        // thing the day a rule distinguishes "absent" from "cleared".
        $email = $cell('email');
        if ($email !== '') {
            $values['email'] = $email;
        }

        $dateOfBirth = DateText::parse($cell('date_of_birth'));
        if ($dateOfBirth !== null) {
            $values['date_of_birth'] = $dateOfBirth->toDateString();
        }

        $phone = PhoneText::parse($cell('phone'), $academy->phone_country_code);
        if ($phone !== null) {
            $values += $phone;
        }

        return $values;
    }

    /**
     * A missing or unreadable status means active.
     *
     * Deliberately lenient where `belt` is strict: guessing a belt invents a
     * rank on someone's record, whereas an athlete who is in the file is, by
     * being in the file, someone the academy trains — and the roster's own
     * default for a new athlete is active anyway.
     */
    private function statusFor(string $text): string
    {
        $normalised = mb_strtolower(trim($text));

        return match ($normalised) {
            'inactive', 'inattivo', 'inattiva', 'no', 'ritirato' => AthleteStatus::Inactive->value,
            'suspended', 'sospeso', 'sospesa' => AthleteStatus::Suspended->value,
            default => AthleteStatus::Active->value,
        };
    }

    /**
     * @param array<string, mixed> $values
     *
     * @return array<string, list<string>>
     */
    private function errorsFor(array $values, Academy $academy): array
    {
        $validator = Validator::make($values, AthleteFieldRules::for($academy->id));

        /** @var array<string, list<string>> $errors */
        $errors = $validator->errors()->toArray();

        return $errors;
    }

    /**
     * Who the academy already has, as comparable identities.
     *
     * @return list<array{name: string, born: string|null}>
     */
    private function existingPeople(Academy $academy): array
    {
        /** @var list<array{name: string, born: string|null}> $people */
        $people = $academy->athletes()
            ->get(['first_name', 'last_name', 'date_of_birth'])
            ->map(fn (Athlete $athlete): array => $this->identityOf([
                'first_name' => $athlete->first_name,
                'last_name' => $athlete->last_name,
                'date_of_birth' => $athlete->date_of_birth?->toDateString(),
            ]))
            ->values()
            ->all();

        return $people;
    }

    /**
     * @param array<string, mixed> $values
     *
     * @return array{name: string, born: string|null}
     */
    private function identityOf(array $values): array
    {
        $firstRaw = $values['first_name'] ?? '';
        $lastRaw = $values['last_name'] ?? '';
        $first = mb_strtolower(trim(\is_string($firstRaw) ? $firstRaw : ''));
        $last = mb_strtolower(trim(\is_string($lastRaw) ? $lastRaw : ''));
        $born = $values['date_of_birth'] ?? null;

        return ['name' => "{$first}|{$last}", 'born' => \is_string($born) && $born !== '' ? $born : null];
    }

    /**
     * Is this person already accounted for?
     *
     * The name has to match — that part is not negotiable. A date of birth
     * then only ever *rescues* a row: two people called Marco Rossi with
     * DIFFERENT known birthdays are two people, and both import.
     *
     * Everything else counts as the same person, including the asymmetric case
     * where one side has a birthday and the other does not — which is what a
     * roster typed by hand and a sheet exported from elsewhere usually look
     * like. That will occasionally skip a genuine namesake, and the trade is
     * deliberate: the row comes back in the preview saying *duplicate*, in
     * front of someone who can see it and decide, whereas a roster silently
     * doubled by a second import run is discovered weeks later with attendance
     * already recorded against both copies.
     *
     * @param array{name: string, born: string|null}       $person
     * @param list<array{name: string, born: string|null}> $known
     */
    private function alreadyPresent(array $person, array $known): bool
    {
        foreach ($known as $candidate) {
            if ($candidate['name'] !== $person['name']) {
                continue;
            }

            $bothKnown = $candidate['born'] !== null && $person['born'] !== null;
            if (! $bothKnown || $candidate['born'] === $person['born']) {
                return true;
            }
        }

        return false;
    }
}
