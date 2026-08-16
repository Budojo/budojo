FROM node:22-alpine

# Run as an unprivileged user matching the host developer, not root.
#
# `ng serve` writes its build cache into /app/.angular, and /app is a bind
# mount — on Linux that is the host's real filesystem, so as root it leaves a
# few hundred root-owned files behind that `rm -rf client/.angular` (the
# standard "clear the cache and retry" move) then needs sudo to remove. Docker
# Desktop's 9p share hid this on Windows by faking ownership.
#
# The base image already ships `node` at uid/gid 1000, which is the usual
# single-user Linux box. The remap below only does anything when it isn't.
ARG HOST_UID=1000
ARG HOST_GID=1000
RUN if [ "$HOST_UID:$HOST_GID" != "1000:1000" ]; then \
        deluser node \
        && addgroup -g "$HOST_GID" node \
        && adduser -u "$HOST_UID" -G node -D node; \
    fi \
    # Created here, owned by `node`, so the anonymous volume compose mounts
    # over it inherits that ownership instead of coming back root-owned.
    && mkdir -p /app/node_modules \
    && chown -R node:node /app

WORKDIR /app
USER node

EXPOSE 4200

# npm install runs at startup so volume-mounted source is available
CMD ["sh", "-c", "npm install && npx ng serve --host 0.0.0.0 --poll 500 --proxy-config proxy.conf.json"]
