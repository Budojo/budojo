<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * The vocabulary of belt colours (#1800).
 *
 * Only the colours. Which of them an academy awards, in what order, and how
 * many stripes each carries is its martial art's **ladder**
 * (`App\Support\MartialArt\RankLadder`, read from
 * `database/seed-data/martial-arts/<art>.json`). Blue is 6th of 12 in BJJ
 * and 7th of 12 in taekwondo; red is BJJ's grand master and taekwondo's 2nd
 * kup. A rank on the colour could only ever have been one art's rank, which
 * is why `rank()` and `maxStripes()` left this enum.
 *
 * Values never change: they are what `athletes.belt` and the promotion
 * history store. New colours are appended.
 */
enum Belt: string
{
    // IBJJF youth belts (#230).
    case Grey = 'grey';
    case Yellow = 'yellow';
    case Orange = 'orange';
    case Green = 'green';

    case White = 'white';
    case Blue = 'blue';
    case Purple = 'purple';
    case Brown = 'brown';
    case Black = 'black';

    // Two-colour belts: the coral pair (#229), whose naming — `-and-`, upper
    // half first — every half-belt below follows.
    case RedAndBlack = 'red-and-black';
    case RedAndWhite = 'red-and-white';
    case Red = 'red';

    // Half-belts (#1800) — kids' steps between two kyu in judo and karate,
    // and the intermediate kup in taekwondo.
    case WhiteAndYellow = 'white-and-yellow';
    case YellowAndOrange = 'yellow-and-orange';
    case OrangeAndGreen = 'orange-and-green';
    case GreenAndBlue = 'green-and-blue';
    case BlueAndBrown = 'blue-and-brown';
    case YellowAndGreen = 'yellow-and-green';
    case BlueAndRed = 'blue-and-red';
    // Taekwondo's poom — the black belt of someone under fifteen.
    case BlackAndRed = 'black-and-red';
}
