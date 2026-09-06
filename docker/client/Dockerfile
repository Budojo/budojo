FROM node:22-alpine

WORKDIR /app

EXPOSE 4200

# `npm ci`, not `npm install`, and it runs at startup because node_modules is
# an anonymous volume the image can't pre-populate.
#
# `ci` installs the lockfile exactly rather than re-resolving on every boot:
# faster, reproducible, and the same thing CI does. It also unblocks this
# container outright — the npm bundled with node:22-alpine (10.9.8) crashes
# with `Cannot read properties of null (reading 'edgesOut')` while resolving
# vitest's optional-peer chain, so `npm install` cannot build this tree at
# all any more (#1376). Resolution is done deliberately with a newer npm when
# dependencies change; the lockfile it writes is version 3 and installs here
# fine.
CMD ["sh", "-c", "npm ci && npx ng serve --host 0.0.0.0 --poll 500 --proxy-config proxy.conf.json"]
