#!/usr/bin/env node
/**
 * Maintainer-side licence tooling (#1290). NEVER ships inside the app.
 *
 *   node .claude/scripts/license-key.mjs keygen
 *   node .claude/scripts/license-key.mjs mint "Academy name" [--expires 2027-08-16]
 *
 * `keygen` prints a fresh Ed25519 pair. The PUBLIC half goes into the app's
 * config; the PRIVATE half goes in your password manager and nowhere else —
 * anyone holding it can mint licences.
 *
 * `mint` signs a key, reading the private half from BUDOJO_LICENSE_SECRET so it
 * never lands in shell history or a file in the repo:
 *
 *   BUDOJO_LICENSE_SECRET=... node .claude/scripts/license-key.mjs mint "Budojo Roma"
 *
 * Interop note: Node and libsodium must agree, because the app verifies with
 * PHP's sodium. Node's Ed25519 `sign` emits the same raw 64-byte detached
 * signature `sodium_crypto_sign_verify_detached` expects, and the raw 32-byte
 * public key is the JWK `x` component. Verified across both.
 */
import crypto from 'node:crypto';

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const PREFIX = 'BUDOJO-1-';

function keygen() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pub = fromB64url(publicKey.export({ format: 'jwk' }).x);
  const priv = fromB64url(privateKey.export({ format: 'jwk' }).d);

  console.log('PUBLIC  (goes in the app config, safe to commit):');
  console.log(`  ${b64url(pub)}`);
  console.log('');
  console.log('PRIVATE (password manager ONLY — never commit, never ship):');
  console.log(`  ${b64url(priv)}`);
  console.log('');
  console.log('Mint with:  BUDOJO_LICENSE_SECRET=<private> node .claude/scripts/license-key.mjs mint "Name"');
}

function mint(name, expires) {
  const secret = process.env.BUDOJO_LICENSE_SECRET;

  if (!secret) {
    console.error('BUDOJO_LICENSE_SECRET is not set — the private key is read from the environment on purpose.');
    process.exit(2);
  }
  if (!name) {
    console.error('usage: mint "Academy name" [--expires YYYY-MM-DD]');
    process.exit(2);
  }
  if (expires !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    // A malformed expiry is refused by the app rather than treated as
    // perpetual, so catching it here saves issuing a key that cannot work.
    console.error(`--expires must be YYYY-MM-DD, got "${expires}"`);
    process.exit(2);
  }

  const seed = fromB64url(secret.trim());

  if (seed.length !== 32) {
    console.error(`BUDOJO_LICENSE_SECRET must decode to 32 bytes, got ${seed.length}`);
    process.exit(2);
  }

  // Wrap the raw seed in PKCS#8 rather than rebuilding a JWK: an Ed25519
  // private JWK also requires the public `x` component, which we deliberately
  // do not carry around — the secret stays one opaque string. The prefix is
  // the fixed Ed25519 PKCS#8 header (RFC 8410).
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]),
    format: 'der',
    type: 'pkcs8',
  });

  const claims = { v: 1, name, issued: new Date().toISOString().slice(0, 10) };
  if (expires) claims.expires = expires;

  const payload = Buffer.from(JSON.stringify(claims), 'utf8');
  const signature = crypto.sign(null, payload, privateKey);

  console.log(`${PREFIX}${b64url(payload)}.${b64url(signature)}`);
}

const [command, ...rest] = process.argv.slice(2);
const expiresIndex = rest.indexOf('--expires');
const expires = expiresIndex === -1 ? undefined : rest[expiresIndex + 1];
const name = rest.filter((a, i) => i !== expiresIndex && i !== expiresIndex + 1)[0];

switch (command) {
  case 'keygen':
    keygen();
    break;
  case 'mint':
    mint(name, expires);
    break;
  default:
    console.error('usage: license-key.mjs <keygen|mint>');
    process.exit(2);
}
