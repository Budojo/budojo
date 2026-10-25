package it.budojo.mobile;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Seals the phone's key files with an AES-256-GCM key the Android Keystore
 * makes and keeps (#2134), never in the app's memory or files: in the phone's
 * secure hardware (the TEE) on nearly every phone, in the system's keystore
 * process on one without it, the emulator among them. Either way a copy of
 * the app's files opens nothing. A sealed file is a version byte, the 12-byte IV,
 * then the ciphertext with its tag; the file's name is bound in, so one sealed
 * file cannot stand in for another.
 *
 * <p>The key asks for no fingerprint (#2159 decided the lock): the server
 * starts before the page, so before any prompt, and a key bound to the
 * fingerprint would be invalidated by Android whenever a new finger is
 * enrolled. The lock guards the screen; this guards the files.
 *
 * <p>Opening never makes a key, and sealing makes one only while
 * {@link SealedStore} has sealed nothing yet. A lookup that fails says nothing
 * of whether the key is there, and generating {@code budojo-keys} again would
 * replace it, with every file sealed under it.
 */
final class KeystoreSealer implements SealedStore.Sealer {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "budojo-keys";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final byte VERSION = 1;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    @Override
    public byte[] seal(String name, byte[] plain, boolean mayMakeKey) throws Exception {
        SecretKey key = mayMakeKey ? keyOrNew() : existingKey();
        if (key == null) {
            throw new GeneralSecurityException("this phone's Keystore has no key " + ALIAS
                    + ", and files are sealed under one: no new key over it");
        }
        Cipher cipher = Cipher.getInstance(CIPHER);
        // The Keystore makes the IV: an app may not choose one for its key.
        cipher.init(Cipher.ENCRYPT_MODE, key);
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
        byte[] body = cipher.doFinal(plain);
        byte[] iv = cipher.getIV();
        if (iv.length != IV_BYTES) {
            throw new GeneralSecurityException("unexpected IV of " + iv.length + " bytes");
        }
        byte[] sealed = new byte[1 + IV_BYTES + body.length];
        sealed[0] = VERSION;
        System.arraycopy(iv, 0, sealed, 1, IV_BYTES);
        System.arraycopy(body, 0, sealed, 1 + IV_BYTES, body.length);
        return sealed;
    }

    @Override
    public byte[] open(String name, byte[] sealed) throws Exception {
        if (sealed.length < 1 + IV_BYTES + TAG_BITS / 8 || sealed[0] != VERSION) {
            throw new GeneralSecurityException("not a sealed file");
        }
        SecretKey key = existingKey();
        if (key == null) {
            throw new GeneralSecurityException("this phone's Keystore has no key " + ALIAS);
        }
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, sealed, 1, IV_BYTES));
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
        return cipher.doFinal(sealed, 1 + IV_BYTES, sealed.length - 1 - IV_BYTES);
    }

    /**
     * The key, or null when the Keystore has none under the alias. Since
     * Android 12 {@code getKey} throws on any other failure, where
     * {@code getEntry} answers null for every one.
     */
    private static SecretKey existingKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        return (SecretKey) keyStore.getKey(ALIAS, null);
    }

    private static synchronized SecretKey keyOrNew() throws Exception {
        SecretKey key = existingKey();
        if (key != null) {
            return key;
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }
}
