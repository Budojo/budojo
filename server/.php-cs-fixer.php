<?php

declare(strict_types=1);

use PhpCsFixer\Config;
use PhpCsFixer\Finder;

$directories = array_values(array_filter([
    __DIR__ . '/app',
    __DIR__ . '/routes',
    __DIR__ . '/tests',
], 'is_dir'));

$finder = Finder::create()
    ->in($directories)
    ->name('*.php')
    ->notName('*.blade.php')
    ->ignoreDotFiles(true)
    ->ignoreVCS(true);

return (new Config())
    ->setRiskyAllowed(true)
    ->setCacheFile(__DIR__ . '/.php-cs-fixer.cache')
    ->setRules([
        // ── Rulesets ──────────────────────────────────────────────────────
        '@PHP84Migration' => true,
        '@PSR12'          => true,
        '@PSR12:risky'    => true,

        // ── Imports ───────────────────────────────────────────────────────
        'ordered_imports'              => ['sort_algorithm' => 'alpha'],
        'no_unused_imports'            => true,
        'global_namespace_import'      => ['import_classes' => false, 'import_constants' => false, 'import_functions' => false],

        // ── Arrays ────────────────────────────────────────────────────────
        'array_syntax'                 => ['syntax' => 'short'],
        'trailing_comma_in_multiline'  => ['elements' => ['arrays', 'arguments', 'parameters']],
        'trim_array_spaces'            => true,

        // ── Strings ───────────────────────────────────────────────────────
        'single_quote'                 => true,
        'concat_space'                 => ['spacing' => 'one'],

        // ── Operators & spacing ───────────────────────────────────────────
        'binary_operator_spaces'       => ['default' => 'single_space'],
        'unary_operator_spaces'        => true,
        'not_operator_with_successor_space' => true,

        // ── Control structures ────────────────────────────────────────────
        'blank_line_before_statement'  => [
            'statements' => ['break', 'continue', 'declare', 'return', 'throw', 'try'],
        ],
        'no_superfluous_elseif'        => true,
        'no_useless_else'              => true,
        'simplified_if_return'         => true,

        // ── Classes & methods ─────────────────────────────────────────────
        'class_attributes_separation'  => ['elements' => ['method' => 'one', 'property' => 'one']],
        'ordered_class_elements'       => [
            'order' => [
                'use_trait', 'case',
                'constant_public', 'constant_protected', 'constant_private',
                'property_public', 'property_protected', 'property_private',
                'construct', 'destruct',
                'magic', 'phpunit',
                'method_public', 'method_protected', 'method_private',
            ],
        ],
        'method_argument_space'        => ['on_multiline' => 'ensure_fully_multiline'],
        'single_trait_insert_per_statement' => true,
        'self_accessor'                => true,
        'visibility_required'          => ['elements' => ['property', 'method', 'const']],

        // ── PHP 8.x modern syntax ─────────────────────────────────────────
        'declare_strict_types'         => true,
        'modernize_types_casting'      => true,
        'use_arrow_functions'          => true,
        'native_function_invocation'   => ['include' => ['@compiler_optimized'], 'scope' => 'namespaced', 'strict' => true],

        // ── Phpdoc ────────────────────────────────────────────────────────
        'phpdoc_scalar'                => true,
        'phpdoc_single_line_var_spacing' => true,
        'phpdoc_var_without_name'      => true,
        'no_empty_phpdoc'              => true,
        'phpdoc_trim'                  => true,
    ])
    ->setFinder($finder);
