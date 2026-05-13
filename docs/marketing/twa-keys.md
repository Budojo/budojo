# TWA signing keys — fingerprint registry

Records the SHA-256 fingerprints that need to land in `client/public/.well-known/assetlinks.json` for the TWA to drop the browser chrome (Digital Asset Links verification).

Two layers exist with Google Play App Signing (the default for new Play Console apps since 2021):

| Key | Held by | Used for | SHA goes in assetlinks.json? |
|---|---|---|---|
| **Upload key** | Us (the `android.keystore` from `bubblewrap init`) | Signing the AAB we upload to Play Console; signing sideloaded APKs for direct internal install | Yes — for sideload + internal testing track scenarios |
| **App Signing key** | Google Play | Resigning our AAB into the APK distributed to end-user devices via the store | Yes — this is the SHA users' devices see, so the canonical entry |

Best practice: assetlinks.json carries **both** SHAs so devices accept either signature path.

## Active fingerprints

### Upload key (current, post-loss recovery v2)

```
SHA-256: 1E:BA:F7:6A:00:6D:3A:64:19:90:D1:35:FB:6C:67:D6:2E:6F:3F:C4:C6:F7:58:7F:EE:63:4F:71:2D:88:5C:3B
```

- **Generated**: 2026-05-13 via `bubblewrap init` in the local TWA project directory (convention: `<workspace>/budojo-twa/` — outside this repo)
- **Keystore file**: `android.keystore` at the TWA project root (NOT in repo — local only, see Backup checklist below)
- **Alias**: `budojo-upload`
- **DN**: CN=Matteo Bonanno, OU=Dev, O=Budojo, C=IT
- **Validity**: 50 years (Bubblewrap default)

### App Signing key (PENDING — first AAB upload)

```
SHA-256: TBD — published by Play Console after first AAB upload, under
         Setup → App signing → App signing key certificate
```

After uploading the first AAB to Play Console:
1. Open the new app's page in Play Console
2. Navigate to **Setup → App signing**
3. Copy the **SHA-256 certificate fingerprint** under "App signing key certificate"
4. Paste it here and into `client/public/.well-known/assetlinks.json` as a second entry alongside the upload key SHA
5. PR + release the SPA so Cloudflare Pages serves the updated file

## Deprecated fingerprints

### Upload key (v1, keystore lost)

```
SHA-256: 91:88:45:AA:3C:37:53:87:22:D0:12:3D:ED:EF:24:53:26:8B:1F:8B:9A:71:C6:59:C0:B2:65:82:D0:6A:24:F2
```

- **Generated**: prior bubblewrap init attempt on `pop-os.fritz.box` (PR #522, months ago)
- **Status**: keystore file lost on machine decommissioning — no app can ever sign with this SHA again
- **Removed from `assetlinks.json` in**: the same PR that adds the new upload + app-signing fingerprints (TODO when AAB is uploaded)

## Backup checklist

The upload keystore is irreplaceable. Verify before first AAB upload:

- [ ] `android.keystore` attached to a vetted secret manager (e.g. 1Password) under the entry "Budojo Android — keystore"
- [ ] **Second backup copy** on a medium that's encrypted at rest. Both offline media (encrypted USB stick) and online media (GPG-encrypted file on cloud storage, password-protected archive in cloud storage) qualify, as long as the encryption is end-to-end and the password is held only by the human, not the storage provider. Avoid plain email: regular SMTP / IMAP storage is unencrypted at rest and a single account compromise leaks the upload key. **Note:** Telegram cloud chats (including Saved Messages) are NOT end-to-end encrypted — only Telegram Secret Chats are. If using Telegram for a backup copy, the keystore must be wrapped in a password-protected archive (e.g. 7z/AES) first
- [ ] Keystore password stored in the secret manager (NEVER same vault entry as the keystore file in case the entry is shared)
- [ ] Alias password stored in the secret manager
- [ ] **Recovery rehearsal**: at least once, restore the keystore from the backup and re-run `keytool -list -v -keystore android.keystore -alias budojo-upload` to confirm the SHA-256 matches the one recorded above

If the upload keystore is ever lost again, recovery via Play Console:
1. Generate a new upload key (`bubblewrap update --signing-key` or fresh `bubblewrap init`)
2. Request upload key reset via Play Console support — requires the App Signing key to still be active (it is, Google holds it)
3. Update `assetlinks.json` with the new upload key SHA + keep the App Signing SHA
