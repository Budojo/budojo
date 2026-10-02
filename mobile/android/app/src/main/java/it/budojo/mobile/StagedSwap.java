package it.budojo.mobile;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Swapping in what the sync or a restore staged (#2030, #2079), before PHP
 * starts. Plain {@code java.io} and nothing of Android's, so that a harness on
 * a desktop JDK can put it through every state a start that died halfway
 * leaves behind.
 */
final class StagedSwap {

    private StagedSwap() {
    }

    /**
     * A database the sync staged beside the live one (#2030), or a backup the
     * page brought back (#2079), swapped in before PHP starts.
     *
     * <ul>
     *   <li><b>The reconcile it needs is written down first,</b> as a file, so
     *       that it survives a start that dies after a rename.</li>
     *   <li><b>A backup's files come in with it:</b> {@code storage/app.staged}
     *       takes the place of {@code storage/app}, which steps aside as
     *       {@code app.previous}. Files staged with no database beside them are
     *       a restore that was cut short, and are deleted: the staged database
     *       is what commits one.</li>
     *   <li><b>The live database steps aside as {@code .previous},</b> with its
     *       WAL, which can hold writes the main file does not have yet. It is
     *       the copy to go back to, and the one a rebase will read this
     *       device's own writes from (#2031). An older {@code .previous} goes
     *       only once there is a live database to take its place.</li>
     * </ul>
     *
     * <p>Each step is skipped when a start that died halfway already took it,
     * so the next start finishes the swap. A rebase must reconcile only after
     * its replay (docs/sync/protocol.md); #2031 makes that the reconcile's own
     * business, not the shell's.
     */
    static boolean swapIn(File database, File files, File reconcilePending) throws IOException {
        File staged = new File(database.getPath() + ".staged");
        File stagedFiles = new File(files.getPath() + ".staged");
        if (!staged.exists()) {
            deleteRecursive(stagedFiles);
            return false;
        }
        writeFile(reconcilePending, "");

        if (stagedFiles.exists()) {
            File previousFiles = new File(files.getPath() + ".previous");
            if (files.exists()) {
                deleteRecursive(previousFiles);
                renameOrThrow(files, previousFiles);
            }
            renameOrThrow(stagedFiles, files);
        }

        File previous = new File(database.getPath() + ".previous");
        File wal = new File(database.getPath() + "-wal");
        File previousWal = new File(previous.getPath() + "-wal");
        if (database.exists()) {
            for (String suffix : new String[] {"", "-wal", "-shm"}) {
                new File(previous.getPath() + suffix).delete();
            }
            renameOrThrow(database, previous);
        }
        if (wal.exists()) {
            // With no database beside it, the database already stepped aside
            // and a start died before its WAL followed.
            renameOrThrow(wal, previousWal);
        }
        new File(database.getPath() + "-shm").delete();
        new File(previous.getPath() + "-shm").delete();
        renameOrThrow(staged, database);
        return true;
    }

    static void renameOrThrow(File from, File to) throws IOException {
        if (!from.renameTo(to)) {
            throw new IOException("could not rename " + from.getName() + " to " + to.getName());
        }
    }

    static void deleteRecursive(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursive(child);
            }
        }
        file.delete();
    }

    private static void writeFile(File file, String text) throws IOException {
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }
}
