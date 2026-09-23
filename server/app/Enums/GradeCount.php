<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * What a "stripe" on a grade counts (#1800).
 *
 * The stored value is always a plain 0…cap integer in `athletes.stripes`;
 * this says how to read it. A karate ladder carries both — *tacche* on a
 * green belt, dan on the black one — which is why it belongs to the grade
 * and not to the martial art.
 */
enum GradeCount: string
{
    /** A tape, a *tacca*, a BJJ grau — something on the belt. */
    case Stripe = 'stripe';
    /** A black-belt degree. Not marked on the belt by any of our federations. */
    case Dan = 'dan';
    /** Taekwondo's under-15 black-belt degree. */
    case Poom = 'poom';
}
