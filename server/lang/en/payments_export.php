<?php

declare(strict_types=1);

/*
 * The accountant's payments file (#1762), in the owner's language. Keep in
 * step with `lang/it/payments_export.php`.
 */
return [
    'header' => [
        'date' => 'Date',
        'type' => 'Type',
        'athlete' => 'Athlete',
        'amount' => 'Amount',
        'currency' => 'Currency',
        'period_or_entries' => 'Months or entries',
        'method' => 'Method',
        'covers' => 'Covers',
        'code' => 'Code',
    ],
    'type' => [
        'fee' => 'Fee',
        'carnet' => 'Carnet',
    ],
    'method' => [
        'cash' => 'Cash',
        'transfer' => 'Bank transfer',
        'pos' => 'Card',
        'other' => 'Other',
    ],
];
