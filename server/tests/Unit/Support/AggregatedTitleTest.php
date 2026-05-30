<?php

declare(strict_types=1);

use App\Support\AggregatedTitle;

it('renders a single-actor title when there are no others', function (): void {
    expect(AggregatedTitle::make('Marco Rossi', 0, 'reacted to your post'))
        ->toBe('Marco Rossi reacted to your post');
});

it('renders "and 1 other" for exactly one other actor', function (): void {
    expect(AggregatedTitle::make('Marco Rossi', 1, 'reacted to your post'))
        ->toBe('Marco Rossi and 1 other reacted to your post');
});

it('renders "and N others" for several other actors', function (): void {
    expect(AggregatedTitle::make('Marco Rossi', 3, 'commented on your post'))
        ->toBe('Marco Rossi and 3 others commented on your post');
});

it('clamps a negative other count to the single-actor form', function (): void {
    expect(AggregatedTitle::make('Marco Rossi', -1, 'reacted to your post'))
        ->toBe('Marco Rossi reacted to your post');
});
