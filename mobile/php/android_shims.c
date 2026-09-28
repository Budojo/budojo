/*
 * Android's app seccomp policy on arm64 allows accept4 and not accept: bionic
 * only ever calls accept4, and the policy is built from what bionic uses.
 * musl's accept() makes the raw accept syscall, so the kernel kills the process
 * with SIGSYS (exit 159 = 128 + 31) the moment PHP's built-in server accepts a
 * connection. Found on a real phone with #2044's 0.0.8 probes: PHP alone ran,
 * Laravel in-process answered 200, and the server died on its first client.
 *
 * The link wraps accept (-Wl,--wrap=accept, mobile/php/build.sh), so every
 * call PHP makes lands here and goes out as accept4 with no flags. accept4
 * with no flags is exactly accept.
 */
#define _GNU_SOURCE
#include <sys/socket.h>

int __wrap_accept(int fd, struct sockaddr *restrict addr, socklen_t *restrict len)
{
    return accept4(fd, addr, len, 0);
}
