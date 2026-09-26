<?php

declare(strict_types=1);

/*
 * Le notifiche del titolare, scritte nella sua lingua quando vengono lette
 * (#1912). Tenere allineato con `lang/en/notifications.php`.
 */
return [
    'missed_streak' => [
        'title' => ":name non si allena da un po'",
        'body' => "{1} Ha saltato l'ultimo allenamento in programma.|[2,*] Ha saltato gli ultimi :count allenamenti in programma.",
    ],
    'unpaid_digest' => [
        'title' => '{1} Un atleta non ha ancora pagato la quota di :month|[2,*] :count atleti non hanno ancora pagato la quota di :month',
    ],
    'medical_digest' => [
        'title' => '{1} Un certificato medico sta per scadere|[2,*] :count certificati medici stanno per scadere',
    ],
    'academy_documents_digest' => [
        'title' => "{1} Un documento dell'accademia sta per scadere|[2,*] :count documenti dell'accademia stanno per scadere",
    ],
    'names_and_more' => ':names e altri :more',
    'document_expires' => ':name, scade il :date',
];
