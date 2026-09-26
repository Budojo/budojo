<?php

declare(strict_types=1);

/*
 * The owner's notifications, written in the owner's language at read time
 * (#1912) by `App\Support\NotificationText`, for the inbox and the Windows
 * notification alike. Keep `lang/it/notifications.php` in step.
 */
return [
    'missed_streak' => [
        'title' => ":name hasn't trained in a while",
        'body' => '{1} Missed the last scheduled training.|[2,*] Missed the last :count scheduled trainings.',
    ],
    'unpaid_digest' => [
        'title' => "{1} 1 athlete hasn't paid :month's fee yet|[2,*] :count athletes haven't paid :month's fee yet",
    ],
    'medical_digest' => [
        'title' => '{1} A medical certificate is expiring|[2,*] :count medical certificates are expiring',
    ],
    'academy_documents_digest' => [
        'title' => "{1} One of the academy's documents is expiring|[2,*] :count of the academy's documents are expiring",
    ],
    'names_and_more' => ':names and :more more',
    'document_expires' => ':name, expires :date',
];
