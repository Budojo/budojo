<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * What a class, a lesson or a programme topic is trained in (#1562, #1563,
 * #1803).
 *
 * Every martial art Budojo knows splits the same way: two modes and a middle.
 * Heel hooks are no-gi and lapel guards are gi; ō-soto-gari is tachi-waza and
 * kesa-gatame is ne-waza; a kata is not kumite. A coverage chart that mixes
 * the two halves says a number that is quietly wrong, which is why the split
 * exists at all.
 *
 * One vocabulary for all four arts, and the art's profile says which pair an
 * academy may use ({@see \App\Support\MartialArt\MartialArtProfile::trainingModes()}).
 * `Both` is the middle every art has: a topic that makes sense either way,
 * karate's kihon, an open mat. `Other` is class-only — conditioning or a yoga
 * slot on the timetable. A topic is the martial art by definition, so there
 * is nothing else for it to be.
 *
 * Wire values are the ones stored in the three `kind` columns; the BJJ cases
 * are the values `ClassKind` and `TopicKind` stored before this enum replaced
 * them.
 */
enum TrainingMode: string
{
    case Gi = 'gi';
    case NoGi = 'nogi';
    case TachiWaza = 'tachi-waza';
    case NeWaza = 'ne-waza';
    case Kata = 'kata';
    case Kumite = 'kumite';
    case Poomsae = 'poomsae';
    case Kyorugi = 'kyorugi';
    case Both = 'both';
    case Other = 'other';

    /**
     * The topic modes a class, a lesson or a coverage filter in this mode
     * counts, or null for all of them.
     *
     * A mode admits itself and `both`: a gi class draws on gi and on
     * either-way techniques, never on no-gi ones. `both` and `other` narrow
     * nothing. The rule is the same in every art, so it is written once here
     * and not as a case per mode — a list of cases is the thing that threw
     * the first time a new mode reached it.
     *
     * @return list<string>|null
     */
    public function admittedTopicModes(): ?array
    {
        return $this === self::Both || $this === self::Other
            ? null
            : [$this->value, self::Both->value];
    }
}
