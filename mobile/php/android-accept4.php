<?php

declare(strict_types=1);

/*
 * A static-php-cli patch script (#2044), passed with --with-added-patch.
 *
 * Android's app seccomp policy on arm64 allows accept4 and not accept (bionic
 * only ever calls accept4, and the policy is built from what bionic uses).
 * musl's accept() makes the raw accept syscall, so the kernel kills PHP with
 * SIGSYS (exit 159 = 128 + 31) the moment the built-in server accepts a
 * connection. Found on a real phone with 0.0.8's probes: PHP alone ran,
 * Laravel answered 200 in-process, and the server died on its first client.
 *
 * PHP 8.4 calls accept() in two places, and both become accept4(...,
 * SOCK_CLOEXEC). The flag is not decoration: musl's accept4() with flags 0
 * calls accept(), which is how 0.0.10 still died on the phone with this patch
 * applied. SOCK_CLOEXEC forces the real accept4 syscall, and a client socket
 * that no child process inherits is what PHP wants anyway. A link-time --wrap
 * was tried before this and did not reach the CLI's link.
 *
 * CI proves it on every build: the binary serves a page under a seccomp
 * policy that kills any process calling accept (.github/workflows/mobile-apk.yml).
 */

if (patch_point() !== 'before-php-configure') {
    return;
}

$edits = [
    'sapi/cli/php_cli_server.c' => [
        'client_sock = accept(server->server_sock, sa, &socklen);',
        'client_sock = accept4(server->server_sock, sa, &socklen, SOCK_CLOEXEC);',
    ],
    'main/network.c' => [
        'clisock = accept(srvsock, (struct sockaddr*)&sa, &sl);',
        'clisock = accept4(srvsock, (struct sockaddr*)&sa, &sl, SOCK_CLOEXEC);',
    ],
];

foreach ($edits as $file => [$from, $to]) {
    $path = SOURCE_PATH . '/php-src/' . $file;
    $code = (string) file_get_contents($path);
    if (str_contains($code, $to)) {
        continue;
    }
    if (!str_contains($code, $from)) {
        throw new RuntimeException("android accept4 patch: the accept() call was not found in {$file}; PHP changed, re-check the patch");
    }
    file_put_contents($path, str_replace($from, $to, $code));
    echo "android accept4 patch: {$file}\n";
}
