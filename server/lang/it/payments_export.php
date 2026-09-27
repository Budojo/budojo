<?php

declare(strict_types=1);

/*
 * Il file dei pagamenti per il commercialista (#1762), nella lingua del
 * titolare. Tenere allineato con `lang/en/payments_export.php`.
 */
return [
    'header' => [
        'date' => 'Data',
        'type' => 'Tipo',
        'athlete' => 'Atleta',
        'amount' => 'Importo',
        'currency' => 'Valuta',
        'period_or_entries' => 'Mesi o ingressi',
        'method' => 'Metodo',
        'covers' => 'Periodo',
        'code' => 'Codice',
    ],
    'type' => [
        'fee' => 'Quota',
        'carnet' => 'Carnet',
    ],
    'method' => [
        'cash' => 'Contanti',
        'transfer' => 'Bonifico',
        'pos' => 'Carta',
        'other' => 'Altro',
    ],
];
