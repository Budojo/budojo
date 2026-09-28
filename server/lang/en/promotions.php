<?php

declare(strict_types=1);

/*
 * What the promotion history says back when a row does not fit (#1991), in
 * the owner's language. Keep in step with `lang/it/promotions.php`.
 */
return [
    // A backfill that has the athlete go backwards next to a row already
    // recorded: a warning the owner may confirm, not a refusal.
    'chain' => [
        // Chosen by the count held (`trans_choice`): one stripe, or many.
        'stripes_before_to' => 'On :date they already had :held stripe: this would take them to :to.|On :date they already had :held stripes: this would take them to :to.',
        'stripes_before_from' => 'On :date they already had :held stripe: this would start them from :from.|On :date they already had :held stripes: this would start them from :from.',
        'stripes_after' => 'On :date they still had :held stripe: this would take them to :to.|On :date they still had :held stripes: this would take them to :to.',
        'belt_before' => 'On :date they were already on a higher belt: this would put them on a lower one.',
        'belt_after' => 'On :date they were still on a lower belt: this would put them on a higher one.',
        'starting_belt_after' => "A promotion is already recorded on :date: this can't be the starting belt.",
    ],
    'same_belt' => 'The new belt must differ from the previous one.',
    'same_stripes' => 'The new stripe count must differ from the previous one.',
    'only_starting_row' => 'Only a starting belt row can be given the belt it came from.',
    'from_is_to' => 'The belt it came from must differ from the belt it reached.',
    'not_before' => "That belt doesn't come before this one on the academy's ladder.",
    'window' => [
        'between' => 'Must be after :after and no later than :before.',
        'after' => 'Must be after :after.',
        'before' => 'Must be no later than :before.',
        'future' => 'Must not be in the future.',
    ],
];
