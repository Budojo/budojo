package it.budojo.mobile;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.ServerSocket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONObject;

/**
 * Budojo's server on the phone (#2044, #2034): the phone's counterpart of the
 * desktop's php-supervisor.
 *
 * The PHP binary is static (built from source in CI, mobile/php/) and ships as
 * {@code libphp.so}. Android only executes binaries from the app's native
 * library directory (W^X since Android 10), so it travels disguised as a library
 * and is extracted there at install time ({@code useLegacyPackaging}).
 *
 * {@code start()} unpacks the server bundle when the APK carries a new one,
 * swaps in a database the sync staged, makes this phone's keys on its first
 * start, runs the migrations, starts {@code php -S 127.0.0.1:<port>} with the
 * framework's router (as the desktop does), and waits for
 * {@code /api/v1/health}. The page calls it before Angular boots, and again if
 * a request finds the server gone: Android kills an app's child processes in
 * the background (the phantom process killer, Android 12+).
 */
@CapacitorPlugin(name = "PhpServer")
public class PhpServerPlugin extends Plugin {

    private Process server;
    private int port;
    private boolean opcacheOff;

    /**
     * What lets this app's page, and nothing else on {@code 127.0.0.1}, open
     * the owner's session and bring a backup in (#2079, the server's
     * {@code RequireShell}). Made once per launch of the app, handed to PHP as
     * {@code BUDOJO_SHELL_SECRET} and to the page in every start's answer; it
     * is never written anywhere. Every other app on the phone can reach the
     * server's port, and none of them can read this process's memory.
     */
    private final String shellSecret = randomHex(32);

    @PluginMethod
    public void start(PluginCall call) {
        new Thread(() -> {
            try {
                call.resolve(startServer());
            } catch (Exception e) {
                call.reject(e.getClass().getSimpleName() + ": " + e.getMessage(), e);
            }
        }).start();
    }

    /**
     * Stops the server and starts it again, so that a database the page just
     * staged (a backup it brought back, #2079) is swapped in now rather than at
     * the app's next launch. The answer is {@code start()}'s.
     */
    @PluginMethod
    public void restart(PluginCall call) {
        new Thread(() -> {
            try {
                synchronized (this) {
                    stopServerAndWait();
                }
                call.resolve(startServer());
            } catch (Exception e) {
                call.reject(e.getClass().getSimpleName() + ": " + e.getMessage(), e);
            }
        }).start();
    }

    /**
     * Takes the academy's keys the PC put with the Google account (#2033):
     * - **the two app keys,** so this phone opens what the PC encrypted: the
     *   medical certificates its restored backup holds. Checked as the
     *   desktop's keychain checks them; the phone's own pair is kept beside as
     *   {@code secrets.previous.json};
     * - **the sync key and the folder id,** when the page passes them: the
     *   phone joins the academy's sync (#2046, protocol § Joining), and makes
     *   its device id, once.
     *
     * Takes effect at the server's next start, which the page asks for.
     * Answers whether anything changed.
     */
    @PluginMethod
    public void adoptKeys(PluginCall call) {
        String appKey = call.getString("APP_KEY");
        String documentKey = call.getString("DOCUMENT_ENCRYPTION_KEY");
        String syncKey = call.getString("syncKey");
        String folder = call.getString("folder");
        // 32 bytes of padded base64 each, as both devices make them
        // (desktop/src/bootstrap.ts, generateSecrets; secrets() here): never a
        // key that would stop Laravel at the next start. Stricter than the keys
        // file's readers, which take any long enough key.
        if (appKey == null || !appKey.matches("base64:[A-Za-z0-9+/]{43}=")
                || documentKey == null || !documentKey.matches("[A-Za-z0-9+/]{43}=")) {
            call.reject("not an academy's keys", "INVALID_KEYS");
            return;
        }
        // Both or neither, with the keys file's shapes (client/src/app/core/sync/keys.ts).
        if ((syncKey == null) != (folder == null)
                || (syncKey != null && (!syncKey.matches("[A-Za-z0-9+/]{43}=") || !folder.matches("[0-9a-f]{32}")))) {
            call.reject("not an academy's sync key and folder", "INVALID_KEYS");
            return;
        }
        try {
            File files = getContext().getFilesDir();
            JSONObject current = secrets(files);
            boolean changed = false;
            if (!appKey.equals(current.getString("APP_KEY"))
                    || !documentKey.equals(current.getString("DOCUMENT_ENCRYPTION_KEY"))) {
                JSONObject adopted = new JSONObject();
                adopted.put("v", 1);
                adopted.put("APP_KEY", appKey);
                adopted.put("DOCUMENT_ENCRYPTION_KEY", documentKey);
                writeFileSynced(new File(files, "secrets.previous.json"), current.toString());
                replaceSynced(files, "secrets.json", adopted.toString());
                changed = true;
            }
            if (syncKey != null) {
                changed |= joinSync(files, syncKey, folder);
            }
            JSObject out = new JSObject();
            out.put("changed", changed);
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getClass().getSimpleName() + ": " + e.getMessage(), e);
        }
    }

    /**
     * This phone's place in the academy's sync, or an empty answer before it
     * joined: its device id, the folder id and the sync key (#2046).
     */
    @PluginMethod
    public void syncIdentity(PluginCall call) {
        try {
            JSONObject sync = syncFile(getContext().getFilesDir());
            JSObject out = new JSObject();
            if (sync != null) {
                out.put("device", sync.getString("device"));
                out.put("folder", sync.getString("folder"));
                out.put("syncKey", sync.getString("syncKey"));
            }
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getClass().getSimpleName() + ": " + e.getMessage(), e);
        }
    }

    /**
     * Keeps the sync key and the folder id in {@code sync.json}, beside the
     * app keys and under the same guard ({@code secrets()}), and makes this
     * phone's device id the first time: a kind and four random characters
     * (protocol § The folder). The id is kept for good, so a phone that joins
     * again is still the same device. True when anything changed: the server
     * journals its writes under the id from its next start.
     */
    private static boolean joinSync(File files, String syncKey, String folder) throws Exception {
        JSONObject current = syncFile(files);
        if (current != null && syncKey.equals(current.getString("syncKey"))
                && folder.equals(current.getString("folder"))) {
            return false;
        }
        JSONObject sync = new JSONObject();
        sync.put("v", 1);
        sync.put("device", current != null ? current.getString("device") : newDeviceId());
        sync.put("folder", folder);
        sync.put("syncKey", syncKey);
        replaceSynced(files, "sync.json", sync.toString());
        return true;
    }

    private static JSONObject syncFile(File files) throws Exception {
        File file = new File(files, "sync.json");
        return file.exists() ? new JSONObject(readFile(file)) : null;
    }

    private static String newDeviceId() {
        String alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
        java.security.SecureRandom random = new java.security.SecureRandom();
        StringBuilder id = new StringBuilder("phone");
        for (int i = 0; i < 4; i++) {
            id.append(alphabet.charAt(random.nextInt(alphabet.length())));
        }
        return id.toString();
    }

    /**
     * On the disk before the rename: a crash right after must not leave an
     * empty file, which would stop every start that follows.
     */
    private static void replaceSynced(File files, String name, String text) throws IOException {
        File part = new File(files, name + ".part");
        writeFileSynced(part, text);
        if (!part.renameTo(new File(files, name))) {
            throw new IOException("could not write " + name);
        }
    }

    /**
     * Back from the background: if Android killed the server meanwhile, start it
     * again now, before the page's next request has to wait for it.
     */
    @Override
    protected void handleOnResume() {
        if (server != null && !server.isAlive()) {
            new Thread(() -> {
                try {
                    startServer();
                } catch (Exception ignored) {
                    // The page's next request starts it again and shows the error.
                }
            }).start();
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopServer();
    }

    private void stopServer() {
        if (server != null) {
            server.destroy();
            server = null;
        }
    }

    /** Stopped, and gone: the swap renames the database it may still hold open. */
    private void stopServerAndWait() throws InterruptedException {
        Process stopping = server;
        stopServer();
        if (stopping != null && !stopping.waitFor(5, TimeUnit.SECONDS)) {
            stopping.destroyForcibly();
            stopping.waitFor(5, TimeUnit.SECONDS);
        }
    }

    private synchronized JSObject startServer() throws Exception {
        Context context = getContext();
        JSObject out = new JSObject();

        if (server != null && server.isAlive()) {
            // A server busy with one long request, a restore (#2079), answers
            // nothing else meanwhile: it has one worker. It is waited for, as
            // its first start is, before it is taken for hung and killed.
            if (isHealthy(port) || answersWithin(server, port, 60_000)) {
                out.put("port", port);
                out.put("shellSecret", shellSecret);
                out.put("alreadyRunning", true);
                return out;
            }
            // Alive but not answering: never report it as running (#2050 review).
            stopServer();
        }

        long t0 = System.nanoTime();
        // Per run, not per plugin: a later start must not report an earlier
        // run's fallback (#2050 review).
        opcacheOff = false;
        File files = context.getFilesDir();
        File php = new File(context.getApplicationInfo().nativeLibraryDir, "libphp.so");
        if (!php.canExecute()) {
            throw new IOException("libphp.so is missing or not executable in " + php.getParent());
        }

        File serverDir = new File(files, "server");
        File marker = new File(serverDir, ".bundle-id");
        String bundleId = new JSONObject(readAsset("bundle.json")).getString("bundleId");
        boolean extracted = false;
        if (!marker.exists() || !readFile(marker).equals(bundleId)) {
            deleteRecursive(serverDir);
            unzipAsset("budojo-server.zip", serverDir);
            writeFile(marker, bundleId);
            extracted = true;
        }
        long tExtracted = System.nanoTime();

        File database = new File(files, "budojo.sqlite");
        forgetTheSpikesDemo(files);
        File reconcilePending = new File(database.getPath() + ".reconcile");
        File storage = new File(files, "storage");
        boolean swapped = StagedSwap.swapIn(database, new File(storage, "app"), reconcilePending);
        if (!database.exists()) {
            // A first start: an empty database, which the migrations below fill.
            database.createNewFile();
        }
        for (String dir : new String[] {"app/private", "app/public", "framework/cache/data", "framework/sessions", "framework/views", "logs"}) {
            new File(storage, dir).mkdirs();
        }
        File tmp = context.getCacheDir();
        File opcacheDir = new File(tmp, "opcache");
        opcacheDir.mkdirs();
        File ini = new File(files, "php.ini");
        writeFile(ini, "memory_limit=256M\n"
                // A database staged by the sync is one request body (#2030).
                + "post_max_size=256M\n"
                + "upload_max_filesize=32M\n"
                + "error_log=" + new File(files, "php-error.log").getAbsolutePath() + "\n"
                + "sys_temp_dir=" + tmp.getAbsolutePath() + "\n"
                + "upload_tmp_dir=" + tmp.getAbsolutePath() + "\n"
                + "session.save_path=" + tmp.getAbsolutePath() + "\n"
                // OPcache in file-cache-only mode: no shared memory, so no lock.
                // On a real phone (0.0.4, 0.0.5) the shared-memory lock failed with
                // "Cannot create lock - Permission denied (13)": fcntl on the lock
                // file is refused, whichever directory it lives in. The file cache
                // still keeps compiled scripts, on disk.
                + "opcache.enable=1\nopcache.enable_cli=1\n"
                + "opcache.file_cache=" + opcacheDir.getAbsolutePath() + "\n"
                + "opcache.file_cache_only=1\n"
                + "opcache.lockfile_path=" + tmp.getAbsolutePath() + "\n");

        Map<String, String> env = environment(secrets(files), syncFile(files), database, storage, tmp, files);

        long tMigrate0 = System.nanoTime();
        String migrate;
        try {
            migrate = runToEnd(php, ini, serverDir, env, "artisan", "migrate", "--force", "--no-interaction");
        } catch (IOException e) {
            if (!String.valueOf(e.getMessage()).contains("Cannot create lock")) {
                throw e;
            }
            // Without OPcache rather than not at all; the start's answer says so.
            opcacheOff = true;
            writeFile(ini, readFile(ini) + "\nopcache.enable=0\nopcache.enable_cli=0\n");
            migrate = runToEnd(php, ini, serverDir, env, "artisan", "migrate", "--force", "--no-interaction");
        }
        boolean reconciled = false;
        if (reconcilePending.exists()) {
            // A database swapped in ran no Observer: the cache and the files no
            // row names are reconciled before the app serves (#2030). The marker
            // outlives a failed or killed start, so the reconcile is never
            // skipped; it goes only once the reconcile succeeded.
            runToEnd(php, ini, serverDir, env, "artisan", "budojo:sync-reconcile", "--no-interaction");
            reconcilePending.delete();
            reconciled = true;
        }
        long tMigrated = System.nanoTime();

        // The same port as before when it is free, so a page that already knows
        // the address finds the server again after Android killed it.
        port = port > 0 && isFree(port) ? port : freePort();
        env.put("APP_URL", "http://127.0.0.1:" + port);
        File router = new File(serverDir, "vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php");
        ProcessBuilder builder = new ProcessBuilder(php.getAbsolutePath(), "-c", ini.getAbsolutePath(), "-S", "127.0.0.1:" + port, router.getAbsolutePath());
        builder.directory(new File(serverDir, "public"));
        builder.environment().clear();
        builder.environment().putAll(env);
        builder.redirectErrorStream(true);
        builder.redirectOutput(new File(files, "php-server.log"));
        server = builder.start();
        long firstRequestMs;
        try {
            firstRequestMs = waitForHealth(server, port, 90_000);
        } catch (Exception e) {
            // A process that never answered is not left behind for a retry to
            // mistake for a running server (#2050 review). What it said goes into
            // the error: on a phone, the error is the only log anyone reads.
            String alive = server.isAlive() ? "still running" : "exited " + server.exitValue();
            stopServer();
            throw new IOException(e.getClass().getSimpleName() + ": " + e.getMessage() + " (server " + alive
                    + ", migrate " + ms(tMigrate0, tMigrated) + " ms)"
                    + "\n--- php-server.log\n" + tailOf(new File(files, "php-server.log"), 500)
                    + "\n--- php-error.log\n" + tailOf(new File(files, "php-error.log"), 300)
                    + "\n--- laravel.log\n" + tailOf(new File(storage, "logs/laravel.log"), 500)
                    + "\n=== probes\n" + probes(php, ini, serverDir, env, tmp), e);
        }
        long tReady = System.nanoTime();

        out.put("port", port);
        out.put("shellSecret", shellSecret);
        out.put("extracted", extracted);
        out.put("swapped", swapped);
        out.put("reconciled", reconciled);
        out.put("unpackMs", ms(t0, tExtracted));
        out.put("migrateMs", ms(tMigrate0, tMigrated));
        out.put("serverMs", ms(tMigrated, tReady));
        out.put("firstRequestMs", firstRequestMs);
        out.put("totalMs", ms(t0, tReady));
        out.put("migrateOutput", tail(migrate, 400));
        out.put("opcache", opcacheOff ? "off" : "file-cache");
        return out;
    }

    /** The desktop's environment (desktop/src/php-runtime.ts), with the phone's paths. */
    private Map<String, String> environment(JSONObject secrets, JSONObject sync, File database, File storage, File tmp, File home) throws Exception {
        Map<String, String> env = new HashMap<>();
        env.put("HOME", home.getAbsolutePath());
        env.put("TMPDIR", tmp.getAbsolutePath());
        env.put("PHP_INI_SCAN_DIR", "");
        env.put("BUDOJO_RUNTIME", "mobile");
        env.put("BUDOJO_SHELL_SECRET", shellSecret);
        env.put("APP_NAME", "Budojo");
        env.put("APP_ENV", "production");
        env.put("APP_DEBUG", "false");
        env.put("APP_KEY", secrets.getString("APP_KEY"));
        env.put("DOCUMENT_ENCRYPTION_KEY", secrets.getString("DOCUMENT_ENCRYPTION_KEY"));
        env.put("DB_CONNECTION", "sqlite");
        env.put("DB_DATABASE", database.getAbsolutePath());
        env.put("QUEUE_CONNECTION", "sync");
        env.put("CACHE_STORE", "file");
        env.put("SESSION_DRIVER", "file");
        env.put("BROADCAST_CONNECTION", "null");
        env.put("FILESYSTEM_DISK", "local");
        env.put("MAIL_MAILER", "log");
        env.put("LOG_CHANNEL", "single");
        env.put("LARAVEL_STORAGE_PATH", storage.getAbsolutePath());
        if (sync != null) {
            // From the phone's joining on, its writes are journaled for the sync (#2031).
            env.put("BUDOJO_DEVICE_ID", sync.getString("device"));
        }
        return env;
    }

    /**
     * This phone's keys, made on its first start and kept in the app's private
     * files, as the desktop keeps its own (#1223). The same shape as the
     * desktop's keychain record, so the door can replace them with the
     * academy's from the Google account (#2033). They never leave the phone: the manifest
     * turns off the backup ({@code allowBackup="false"}, up to Android 11) and,
     * on Android 12+, the transfer to a new phone, which ignores that flag
     * ({@code res/xml/data_extraction_rules.xml}). Both are needed.
     */
    private static JSONObject secrets(File files) throws Exception {
        File file = new File(files, "secrets.json");
        if (file.exists()) {
            return new JSONObject(readFile(file));
        }
        java.security.SecureRandom random = new java.security.SecureRandom();
        byte[] appKey = new byte[32];
        byte[] documentKey = new byte[32];
        random.nextBytes(appKey);
        random.nextBytes(documentKey);
        JSONObject secrets = new JSONObject();
        secrets.put("v", 1);
        secrets.put("APP_KEY", "base64:" + android.util.Base64.encodeToString(appKey, android.util.Base64.NO_WRAP));
        secrets.put("DOCUMENT_ENCRYPTION_KEY", android.util.Base64.encodeToString(documentKey, android.util.Base64.NO_WRAP));
        writeFile(file, secrets.toString());
        return secrets;
    }

    /**
     * The test builds of #2044 seeded a demo academy and marked its database
     * with the bundle it came with. That database is not the owner's: the
     * first real start drops it, once, and begins with an empty one.
     */
    private static void forgetTheSpikesDemo(File files) {
        File demoMarker = new File(files, "budojo.sqlite.bundle-id");
        if (!demoMarker.exists()) {
            return;
        }
        for (String suffix : new String[] {"", "-wal", "-shm"}) {
            new File(files, "budojo.sqlite" + suffix).delete();
        }
        demoMarker.delete();
    }

    private static String randomHex(int bytes) {
        byte[] raw = new byte[bytes];
        new java.security.SecureRandom().nextBytes(raw);
        StringBuilder hex = new StringBuilder(bytes * 2);
        for (byte b : raw) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    private String runToEnd(File php, File ini, File cwd, Map<String, String> env, String... args) throws Exception {
        String[] command = new String[args.length + 3];
        command[0] = php.getAbsolutePath();
        command[1] = "-c";
        command[2] = ini.getAbsolutePath();
        System.arraycopy(args, 0, command, 3, args.length);
        ProcessBuilder builder = new ProcessBuilder(command);
        builder.directory(cwd);
        builder.environment().clear();
        builder.environment().putAll(env);
        builder.redirectErrorStream(true);
        Process process = builder.start();
        String output = readAll(process.getInputStream());
        if (!process.waitFor(120, TimeUnit.SECONDS)) {
            process.destroy();
            throw new IOException("php " + String.join(" ", args) + " timed out");
        }
        if (process.exitValue() != 0) {
            throw new IOException("php " + String.join(" ", args) + " exited " + process.exitValue() + ": " + tail(output, 600));
        }
        return output;
    }

    private static boolean answersWithin(Process process, int port, long timeoutMs) {
        try {
            waitForHealth(process, port, timeoutMs);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean isHealthy(int port) {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:" + port + "/api/v1/health").openConnection();
            connection.setConnectTimeout(500);
            connection.setReadTimeout(1000);
            return connection.getResponseCode() == 200;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * Waits for the server's first answer, and returns how long that one request
     * took. The first request compiles the framework, which on a phone can take
     * seconds. So the read timeout is long and a request is never abandoned for
     * a second one: with one worker, abandoned requests queue up behind each
     * other and nobody ever gets an answer (0.0.6 on a real phone). Only
     * connecting is retried, while the process is still binding its port.
     */
    private static long waitForHealth(Process process, int port, long timeoutMs) throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMs;
        int resets = 0;
        while (System.currentTimeMillis() < deadline) {
            if (!process.isAlive()) {
                throw new IOException("the server exited before answering");
            }
            long started = System.nanoTime();
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:" + port + "/api/v1/health").openConnection();
                connection.setConnectTimeout(500);
                connection.setReadTimeout((int) Math.max(1000, deadline - System.currentTimeMillis()));
                int status = connection.getResponseCode();
                if (status == 200) {
                    return ms(started, System.nanoTime());
                }
                throw new IOException("/api/v1/health answered " + status);
            } catch (java.net.ConnectException notListeningYet) {
                Thread.sleep(100);
            } catch (java.net.SocketException reset) {
                // 0.0.7 on a real phone: "Connection reset" with the server up and
                // nothing in its log. Retried until the deadline, so a reset on the
                // first request alone does not fail the run.
                resets++;
                if (resets >= 5) {
                    throw new IOException(resets + " connection resets, last: " + reset.getMessage());
                }
                Thread.sleep(500);
            }
        }
        throw new IOException("the server did not answer /api/v1/health within " + timeoutMs + " ms");
    }

    /**
     * Three independent checks, run only when the server fails, so one screenshot
     * says where it breaks (#2044):
     * <ol>
     *   <li>PHP alone, on the command line;</li>
     *   <li>PHP's built-in server with a one-line page, no Laravel, read over a raw socket;</li>
     *   <li>Laravel handling a request in-process, no server at all.</li>
     * </ol>
     */
    private String probes(File php, File ini, File serverDir, Map<String, String> env, File tmp) {
        StringBuilder report = new StringBuilder();
        report.append("1 cli: ").append(probe(() -> tail(runToEnd(php, ini, serverDir, env, "-r",
                "echo 'ok ', PHP_VERSION, ' ', php_uname('m'), ' ', php_sapi_name();"), 200))).append('\n');
        report.append("2 raw server: ").append(probe(() -> rawServerProbe(php, ini, env, tmp))).append('\n');
        report.append("3 laravel in-process: ").append(probe(() -> {
            File script = new File(tmp, "probe.php");
            String root = serverDir.getAbsolutePath();
            writeFile(script, "<?php\n"
                    + "require '" + root + "/vendor/autoload.php';\n"
                    + "$app = require '" + root + "/bootstrap/app.php';\n"
                    + "$kernel = $app->make(Illuminate\\Contracts\\Http\\Kernel::class);\n"
                    + "$response = $kernel->handle(Illuminate\\Http\\Request::create('/api/v1/health', 'GET'));\n"
                    + "echo $response->getStatusCode(), ' ', substr((string) $response->getContent(), 0, 120);\n");
            return tail(runToEnd(php, ini, serverDir, env, script.getAbsolutePath()), 300);
        })).append('\n');
        return report.toString();
    }

    private interface Probe {
        String run() throws Exception;
    }

    private static String probe(Probe probe) {
        try {
            return probe.run().trim();
        } catch (Exception e) {
            return "FAILED " + e.getClass().getSimpleName() + ": " + tail(String.valueOf(e.getMessage()), 300);
        }
    }

    /** PHP's server with a one-line page, asked over a raw socket so any bytes it sends are shown. */
    private static String rawServerProbe(File php, File ini, Map<String, String> env, File tmp) throws Exception {
        File docroot = new File(tmp, "ping");
        writeFile(new File(docroot, "ping.php"), "<?php echo 'pong';");
        File log = new File(tmp, "ping-server.log");
        int pingPort = freePort();
        ProcessBuilder builder = new ProcessBuilder(php.getAbsolutePath(), "-c", ini.getAbsolutePath(),
                "-S", "127.0.0.1:" + pingPort, "-t", docroot.getAbsolutePath());
        builder.environment().clear();
        builder.environment().putAll(env);
        builder.redirectErrorStream(true);
        builder.redirectOutput(log);
        Process ping = builder.start();
        try {
            Thread.sleep(1500);
            String answer;
            try (java.net.Socket socket = new java.net.Socket("127.0.0.1", pingPort)) {
                socket.setSoTimeout(10_000);
                socket.getOutputStream().write("GET /ping.php HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n".getBytes(StandardCharsets.UTF_8));
                socket.getOutputStream().flush();
                answer = tail(readAll(socket.getInputStream()), 200);
            } catch (IOException e) {
                answer = "socket " + e.getClass().getSimpleName() + ": " + e.getMessage();
            }
            return answer.replace("\r", "") + " | alive=" + ping.isAlive() + " | log: " + tailOf(log, 300);
        } finally {
            ping.destroy();
        }
    }

    private static String tailOf(File file, int max) {
        try {
            return file.exists() ? tail(readFile(file), max) : "(none)";
        } catch (IOException e) {
            return "(unreadable: " + e.getMessage() + ")";
        }
    }

    private static boolean isFree(int candidate) {
        try (ServerSocket socket = new ServerSocket(candidate, 1, java.net.InetAddress.getByName("127.0.0.1"))) {
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private static int freePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }

    private String readAsset(String name) throws IOException {
        try (InputStream in = getContext().getAssets().open(name)) {
            return readAll(in);
        }
    }

    private void unzipAsset(String name, File target) throws IOException {
        String root = target.getCanonicalPath() + File.separator;
        try (ZipInputStream zip = new ZipInputStream(getContext().getAssets().open(name))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                File file = new File(target, entry.getName());
                if (!file.getCanonicalPath().startsWith(root)) {
                    throw new IOException("zip entry outside the target: " + entry.getName());
                }
                if (entry.isDirectory()) {
                    file.mkdirs();
                    continue;
                }
                file.getParentFile().mkdirs();
                try (OutputStream out = new FileOutputStream(file)) {
                    copy(zip, out);
                }
            }
        }
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
    }

    private static String readAll(InputStream in) throws IOException {
        StringBuilder text = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                text.append(line).append('\n');
            }
        }
        return text.toString();
    }

    private static String readFile(File file) throws IOException {
        try (InputStream in = new FileInputStream(file)) {
            return readAll(in).trim();
        }
    }

    private static void writeFileSynced(File file, String text) throws IOException {
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
    }

    private static void writeFile(File file, String text) throws IOException {
        file.getParentFile().mkdirs();
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static void deleteRecursive(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursive(child);
            }
        }
        file.delete();
    }

    private static String tail(String text, int max) {
        return text.length() <= max ? text : text.substring(text.length() - max);
    }

    private static long ms(long from, long to) {
        return TimeUnit.NANOSECONDS.toMillis(to - from);
    }
}
