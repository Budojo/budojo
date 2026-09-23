<?php

declare(strict_types=1);

namespace App\Actions\Syllabus;

use App\Enums\TopicKind;
use App\Exceptions\SyllabusNotEmptyException;
use App\Exceptions\SyllabusProgrammeUnavailableException;
use App\Models\Academy;
use App\Models\SyllabusTopic;
use App\Support\MartialArt\MartialArtProfile;
use Illuminate\Support\Facades\DB;

class SeedSyllabusAction
{
    /**
     * Copies one of the shipped starter programmes into the academy's own rows
     * (#1563) — the one named by `$programme`, or the art's only one when it
     * offers a single programme (#1800). Which programmes an art offers is its
     * registry's answer (`MartialArtProfile::programmes()`).
     *
     * On demand, from a button, never at academy creation: a programme is a
     * claim about what the academy teaches, and an academy that already has
     * one — even one topic — is never overwritten. The rows are the
     * academy's from this moment; the file is never read again for them.
     *
     * @return int how many topics were written
     *
     * @throws SyllabusProgrammeUnavailableException when the art offers no programme yet
     */
    public function execute(Academy $academy, ?string $programme = null): int
    {
        $file = self::resolveFile($academy, $programme);

        return DB::transaction(function () use ($academy, $file): int {
            if (SyllabusTopic::query()->where('academy_id', $academy->id)->exists()) {
                throw new SyllabusNotEmptyException();
            }

            $written = 0;
            foreach (self::positions($file) as $order => $position) {
                $parent = SyllabusTopic::create([
                    'academy_id' => $academy->id,
                    'parent_id' => null,
                    'name' => $position['name'],
                    'kind' => $position['kind'],
                    'in_season' => true,
                    'sort_order' => $order,
                ]);
                $written++;

                foreach ($position['techniques'] as $childOrder => $technique) {
                    SyllabusTopic::create([
                        'academy_id' => $academy->id,
                        'parent_id' => $parent->id,
                        'name' => $technique['name'],
                        'kind' => $technique['kind'],
                        'in_season' => true,
                        'sort_order' => $childOrder,
                    ]);
                    $written++;
                }
            }

            return $written;
        });
    }

    /**
     * A shipped programme, parsed and validated: a technique with no kind of
     * its own inherits its position's. Public so the test that guards every
     * programme file — no duplicate names within a position, every kind valid —
     * reads them through the same code the seed does.
     *
     * @param string $file absolute path, from `MartialArtProfile::programmeFile()`
     *
     * @return list<array{name: string, kind: TopicKind, techniques: list<array{name: string, kind: TopicKind}>}>
     */
    public static function positions(string $file): array
    {
        $raw = file_get_contents($file);
        if ($raw === false) {
            throw new \RuntimeException('The syllabus seed file could not be read.');
        }

        $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (! \is_array($decoded)) {
            throw new \RuntimeException('The syllabus seed file is not a list of positions.');
        }

        $positions = [];
        foreach ($decoded as $position) {
            if (! \is_array($position) || ! \is_string($position['name'] ?? null)) {
                throw new \RuntimeException('Every seed position needs a name.');
            }
            $kind = TopicKind::from(\is_string($position['kind'] ?? null) ? $position['kind'] : 'both');

            $techniques = [];
            foreach (\is_array($position['techniques'] ?? null) ? $position['techniques'] : [] as $technique) {
                if (\is_string($technique)) {
                    $technique = ['name' => $technique];
                }
                if (! \is_array($technique) || ! \is_string($technique['name'] ?? null)) {
                    throw new \RuntimeException("Every technique under {$position['name']} needs a name.");
                }
                $techniques[] = [
                    'name' => $technique['name'],
                    'kind' => \is_string($technique['kind'] ?? null) ? TopicKind::from($technique['kind']) : $kind,
                ];
            }

            $positions[] = ['name' => $position['name'], 'kind' => $kind, 'techniques' => $techniques];
        }

        return $positions;
    }

    /**
     * The programme file to copy. Null `$programme` means "the only one": the
     * request requires a key whenever the art offers more than one, so an
     * omitted key reaching here with several on offer is a programming error.
     */
    private static function resolveFile(Academy $academy, ?string $programme): string
    {
        $profile = MartialArtProfile::for($academy->martial_art);
        $offered = $profile->programmes();
        if ($offered === []) {
            throw new SyllabusProgrammeUnavailableException();
        }

        if ($programme === null) {
            if (\count($offered) > 1) {
                throw new \LogicException('A programme must be named when the martial art offers several.');
            }
            $programme = $offered[0];
        }

        return $profile->programmeFile($programme) ?? throw new SyllabusProgrammeUnavailableException();
    }
}
