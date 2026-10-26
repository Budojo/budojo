package it.budojo.mobile;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * The phone's keys at rest (#2134): each file sealed by a key the Android
 * Keystore keeps ({@link KeystoreSealer}), as {@code <name>.sealed}, never in
 * plain text. Whoever copies the app's files gets the database and sealed
 * keys, and the key that opens them never leaves the phone's secure hardware.
 *
 * <p>Plain {@code java.io} besides the sealer, so a desktop JDK can put it
 * through every state a start that died halfway leaves, as {@link StagedSwap}
 * is:
 * <ul>
 *   <li>an install from before #2134 holds the plain file: the first read
 *       seals it, reads the sealed copy back, and only then deletes the plain
 *       one. One way only;</li>
 *   <li>a sealed file is written beside as {@code .part} and renamed into
 *       place, so a crash never leaves half of one;</li>
 *   <li>a sealed file that does not open is never replaced nor deleted: the
 *       read fails, and so does the server's start, with the reason on the
 *       screen. New keys over it would leave the academy's documents
 *       unreadable for good, and a Keystore that is only slow to wake must not
 *       cost them;</li>
 *   <li>the sealer may make its key only while no file is sealed yet: a
 *       Keystore that fails to find the key it has must never replace it, and
 *       with it every file sealed so far;</li>
 *   <li>the writer before #2134 staged a file as {@code <name>.part}, in plain
 *       text, and renamed it into place. One left by a write that died is
 *       deleted: the key file beside it, sealed or plain, is the one the phone
 *       ran with, and the only keys a staged file can hold alone are the
 *       academy's, which the door took from the Google account and takes
 *       again.</li>
 * </ul>
 */
final class SealedStore {

    /** Seals and opens one file's bytes; the file's name is bound in. */
    interface Sealer {
        /** With {@code mayMakeKey} false, a sealer that finds no key fails rather than make one. */
        byte[] seal(String name, byte[] plain, boolean mayMakeKey) throws Exception;

        byte[] open(String name, byte[] sealed) throws Exception;
    }

    /** A sealed file this phone cannot open. Nothing was deleted or replaced. */
    static final class Unreadable extends IOException {
        private static final long serialVersionUID = 1L;

        Unreadable(String name, Exception cause) {
            super("the keys in " + name + ".sealed do not open on this phone ("
                    + cause.getClass().getSimpleName() + ": " + cause.getMessage()
                    + "); nothing was deleted", cause);
        }
    }

    private final File dir;
    private final Sealer sealer;

    SealedStore(File dir, Sealer sealer) {
        this.dir = dir;
        this.sealer = sealer;
    }

    /** The file's text, or null when this phone has none. Seals a plain one first. */
    String read(String name) throws IOException {
        File sealed = new File(dir, name + ".sealed");
        File plain = new File(dir, name);
        new File(dir, name + ".part").delete();
        if (sealed.exists()) {
            String text = open(name, sealed);
            // A migration that died after the sealed copy was in place.
            plain.delete();
            return text;
        }
        if (!plain.exists()) {
            return null;
        }
        String text = new String(readAll(plain), StandardCharsets.UTF_8);
        write(name, text);
        plain.delete();
        return text;
    }

    /** Seals the text in place of the file's sealed copy, once it is sure to open again. */
    void write(String name, String text) throws IOException {
        byte[] sealed;
        try {
            sealed = sealer.seal(name, text.getBytes(StandardCharsets.UTF_8), !anySealed());
        } catch (Exception e) {
            throw new IOException("could not seal " + name + ": " + e.getMessage(), e);
        }
        // Read back before it counts: a sealed file that does not open is a lost key.
        String back;
        try {
            back = new String(sealer.open(name, sealed), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IOException("sealed " + name + " did not open again: " + e.getMessage(), e);
        }
        if (!back.equals(text)) {
            throw new IOException("sealed " + name + " did not read back the same");
        }
        File part = new File(dir, name + ".sealed.part");
        try (FileOutputStream out = new FileOutputStream(part)) {
            out.write(sealed);
            out.getFD().sync();
        }
        if (!part.renameTo(new File(dir, name + ".sealed"))) {
            throw new IOException("could not write " + name + ".sealed");
        }
    }

    private boolean anySealed() {
        String[] names = dir.list();
        if (names == null) {
            return false;
        }
        for (String each : names) {
            if (each.endsWith(".sealed")) {
                return true;
            }
        }
        return false;
    }

    private String open(String name, File sealed) throws IOException {
        byte[] bytes = readAll(sealed);
        try {
            return new String(sealer.open(name, bytes), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new Unreadable(name, e);
        }
    }

    private static byte[] readAll(File file) throws IOException {
        try (InputStream in = new FileInputStream(file)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) {
                out.write(buffer, 0, n);
            }
            return out.toByteArray();
        }
    }
}
