<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * ISO 3166-2:IT province codes (#72). 107 cases — the standard two-letter
 * Italian car-plate / postal codes. Includes the four "free consortia" of
 * Sicilia and the metropolitan cities of the post-2016 reform. Excludes the
 * abolished provinces (Carbonia-Iglesias, Medio Campidano, Olbia-Tempio,
 * Ogliastra) — `SU` (Sud Sardegna) replaces the four Sardinian ones from 2016.
 *
 * The case names use the official two-letter codes; values match. This enum
 * is required (server-side validated) on every IT-country address; future
 * non-IT countries skip the province field entirely.
 */
enum ItalianProvince: string
{
    case AG = 'AG';
    case AL = 'AL';
    case AN = 'AN';
    case AO = 'AO';
    case AP = 'AP';
    case AQ = 'AQ';
    case AR = 'AR';
    case AT = 'AT';
    case AV = 'AV';
    case BA = 'BA';
    case BG = 'BG';
    case BI = 'BI';
    case BL = 'BL';
    case BN = 'BN';
    case BO = 'BO';
    case BR = 'BR';
    case BS = 'BS';
    case BT = 'BT';
    case BZ = 'BZ';
    case CA = 'CA';
    case CB = 'CB';
    case CE = 'CE';
    case CH = 'CH';
    case CL = 'CL';
    case CN = 'CN';
    case CO = 'CO';
    case CR = 'CR';
    case CS = 'CS';
    case CT = 'CT';
    case CZ = 'CZ';
    case EN = 'EN';
    case FC = 'FC';
    case FE = 'FE';
    case FG = 'FG';
    case FI = 'FI';
    case FM = 'FM';
    case FR = 'FR';
    case GE = 'GE';
    case GO = 'GO';
    case GR = 'GR';
    case IM = 'IM';
    case IS = 'IS';
    case KR = 'KR';
    case LC = 'LC';
    case LE = 'LE';
    case LI = 'LI';
    case LO = 'LO';
    case LT = 'LT';
    case LU = 'LU';
    case MB = 'MB';
    case MC = 'MC';
    case ME = 'ME';
    case MI = 'MI';
    case MN = 'MN';
    case MO = 'MO';
    case MS = 'MS';
    case MT = 'MT';
    case NA = 'NA';
    case NO = 'NO';
    case NU = 'NU';
    case OR = 'OR';
    case PA = 'PA';
    case PC = 'PC';
    case PD = 'PD';
    case PE = 'PE';
    case PG = 'PG';
    case PI = 'PI';
    case PN = 'PN';
    case PO = 'PO';
    case PR = 'PR';
    case PT = 'PT';
    case PU = 'PU';
    case PV = 'PV';
    case PZ = 'PZ';
    case RA = 'RA';
    case RC = 'RC';
    case RE = 'RE';
    case RG = 'RG';
    case RI = 'RI';
    case RM = 'RM';
    case RN = 'RN';
    case RO = 'RO';
    case SA = 'SA';
    case SI = 'SI';
    case SO = 'SO';
    case SP = 'SP';
    case SR = 'SR';
    case SS = 'SS';
    case SU = 'SU';
    case SV = 'SV';
    case TA = 'TA';
    case TE = 'TE';
    case TN = 'TN';
    case TO = 'TO';
    case TP = 'TP';
    case TR = 'TR';
    case TS = 'TS';
    case TV = 'TV';
    case UD = 'UD';
    case VA = 'VA';
    case VB = 'VB';
    case VC = 'VC';
    case VE = 'VE';
    case VI = 'VI';
    case VR = 'VR';
    case VT = 'VT';
    case VV = 'VV';
}
