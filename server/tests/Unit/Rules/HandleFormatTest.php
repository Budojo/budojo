<?php

declare(strict_types=1);

use App\Rules\HandleFormat;

function validateHandleFormat(mixed $value): ?string
{
    $rule = new HandleFormat();
    $error = null;
    $rule->validate('handle', $value, function (string $code) use (&$error): void {
        $error = $code;
    });

    return $error;
}

it('accepts a plain lowercase 3+ char handle', function (): void {
    expect(validateHandleFormat('matteo'))->toBeNull();
    expect(validateHandleFormat('joe'))->toBeNull();
    expect(validateHandleFormat('matteo.bonanno'))->toBeNull();
    expect(validateHandleFormat('matteo_99'))->toBeNull();
    expect(validateHandleFormat('a1b2c3'))->toBeNull();
});

it('rejects strings shorter than 3 chars', function (): void {
    expect(validateHandleFormat(''))->toBe('handle_invalid_format');
    expect(validateHandleFormat('a'))->toBe('handle_invalid_format');
    expect(validateHandleFormat('ab'))->toBe('handle_invalid_format');
});

it('rejects strings longer than 30 chars', function (): void {
    expect(validateHandleFormat(str_repeat('a', 31)))->toBe('handle_invalid_format');
    expect(validateHandleFormat(str_repeat('a', 100)))->toBe('handle_invalid_format');
});

it('rejects mixed-case input — handles are lowercase only', function (): void {
    expect(validateHandleFormat('Matteo'))->toBe('handle_invalid_format');
    expect(validateHandleFormat('MATTEO'))->toBe('handle_invalid_format');
    expect(validateHandleFormat('matTeo'))->toBe('handle_invalid_format');
});

it('rejects digits or symbols at the start', function (): void {
    expect(validateHandleFormat('1matteo'))->toBe('handle_invalid_format');
    expect(validateHandleFormat('_matteo'))->toBe('handle_invalid_format');
    expect(validateHandleFormat('.matteo'))->toBe('handle_invalid_format');
});

it('rejects characters outside [a-z0-9._]', function (): void {
    expect(validateHandleFormat('matteo!'))->toBe('handle_invalid_format');
    expect(validateHandleFormat('matteo bonanno'))->toBe('handle_invalid_format');
    expect(validateHandleFormat('matteo-bonanno'))->toBe('handle_invalid_format');
    expect(validateHandleFormat('matteo@gmail'))->toBe('handle_invalid_format');
    expect(validateHandleFormat('mattéo'))->toBe('handle_invalid_format');
});

it('rejects consecutive dots', function (): void {
    expect(validateHandleFormat('mat..teo'))->toBe('handle_invalid_format');
    expect(validateHandleFormat('m..ab'))->toBe('handle_invalid_format');
});

it('rejects a trailing dot', function (): void {
    expect(validateHandleFormat('matteo.'))->toBe('handle_invalid_format');
});

it('rejects non-string input', function (): void {
    expect(validateHandleFormat(123))->toBe('handle_invalid_format');
});
