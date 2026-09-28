<?php

declare(strict_types=1);

/*
 * Quello che la storia delle promozioni risponde quando una riga non torna
 * (#1991), nella lingua del titolare. Tenere allineato con
 * `lang/en/promotions.php`.
 */
return [
    // Una riga del passato che farebbe tornare indietro l'atleta rispetto a
    // una già registrata: un avviso che il titolare può confermare.
    'chain' => [
        // Scelte in base ai gradi (`trans_choice`): uno, o più.
        'stripes_before_to' => 'Il :date aveva già :held grado: qui arriveresti a :to.|Il :date aveva già :held gradi: qui arriveresti a :to.',
        'stripes_before_from' => 'Il :date aveva già :held grado: qui partiresti da :from.|Il :date aveva già :held gradi: qui partiresti da :from.',
        'stripes_after' => 'Il :date aveva ancora :held grado: qui arriveresti a :to.|Il :date aveva ancora :held gradi: qui arriveresti a :to.',
        'belt_before' => 'Il :date era già a una cintura più alta: qui tornerebbe a una più bassa.',
        'belt_after' => 'Il :date era ancora a una cintura più bassa: qui sarebbe già a una più alta.',
    ],
    'same_belt' => 'La nuova cintura deve essere diversa da quella di prima.',
    'same_stripes' => 'Il nuovo numero di gradi deve essere diverso da quello di prima.',
    'only_starting_row' => 'Solo la riga della cintura di partenza può ricevere la cintura di prima.',
    'from_is_to' => 'La cintura di prima deve essere diversa da quella raggiunta.',
    'not_before' => 'Sulla scala dell\'accademia quella cintura non viene prima di questa.',
    'window' => [
        'between' => 'Deve essere dopo il :after e non oltre il :before.',
        'after' => 'Deve essere dopo il :after.',
        'before' => 'Non può essere oltre il :before.',
        'future' => 'Non può essere nel futuro.',
    ],
];
