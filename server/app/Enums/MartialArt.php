<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * What an academy teaches (#1799, #1800).
 *
 * A property of the academy, not of the athlete: "a dojo is one head — one
 * master, one association president". Closed on purpose — the set of arts
 * Budojo ships a ladder and a programme for is a product decision, and a
 * value outside it would have no registry to read
 * (`database/seed-data/martial-arts/<value>.json`).
 */
enum MartialArt: string
{
    case Bjj = 'bjj';
    case Judo = 'judo';
    case Karate = 'karate';
    case Taekwondo = 'taekwondo';
}
