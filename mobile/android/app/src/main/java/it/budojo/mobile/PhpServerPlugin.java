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
 * Budojo's server on the phone (#2044, the spike): the phone's counterpart of the
 * desktop's php-supervisor.
 *
 * The PHP binary is static (built from source in CI, mobile/php/) and ships as
 * {@code libphp.so}. Android only executes binaries from the app's native
 * library directory (W^X since Android 10), so it travels disguised as a library
 * and is extracted there at install time ({@code useLegacyPackaging}).
 *
 * {@code start()} unpacks the server bundle when the APK carries a new one,
 * copies the demo database on first run, runs the migrations, starts
 * {@code php -S 127.0.0.1:<port>} with the framework's router (as the desktop
 * does), and waits for {@code /api/v1/health}. Each step is timed, because the
 * numbers are what this spike is for.
 */
@CapacitorPlugin(name = "PhpServer")
public class PhpServerPlugin extends Plugin {

    private Process server;
    private int port;

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

    private synchronized JSObject startServer() throws Exception {
        Context context = getContext();
        JSObject out = new JSObject();
        JSONObject spike = new JSONObject(readAsset("spike.json"));
        out.put("demoEmail", spike.getString("demoEmail"));
        out.put("demoPassword", spike.getString("demoPassword"));

        if (server != null && server.isAlive()) {
            if (isHealthy(port)) {
                out.put("port", port);
                out.put("alreadyRunning", true);
                return out;
            }
            // Alive but not answering: never report it as running (#2050 review).
            stopServer();
        }

        long t0 = System.nanoTime();
        File files = context.getFilesDir();
        File php = new File(context.getApplicationInfo().nativeLibraryDir, "libphp.so");
        if (!php.canExecute()) {
            throw new IOException("libphp.so is missing or not executable in " + php.getParent());
        }

        File serverDir = new File(files, "server");
        File marker = new File(serverDir, ".bundle-id");
        String bundleId = spike.getString("bundleId");
        boolean extracted = false;
        if (!marker.exists() || !readFile(marker).equals(bundleId)) {
            deleteRecursive(serverDir);
            unzipAsset("budojo-server.zip", serverDir);
            writeFile(marker, bundleId);
            extracted = true;
        }
        long tExtracted = System.nanoTime();

        File database = new File(files, "budojo.sqlite");
        boolean seeded = false;
        if (!database.exists()) {
            copyAsset("demo.sqlite", database);
            seeded = true;
        }
        File storage = new File(files, "storage");
        for (String dir : new String[] {"app/private", "app/public", "framework/cache/data", "framework/sessions", "framework/views", "logs"}) {
            new File(storage, dir).mkdirs();
        }
        File tmp = context.getCacheDir();
        File ini = new File(files, "php.ini");
        writeFile(ini, "memory_limit=256M\n"
                + "error_log=" + new File(files, "php-error.log").getAbsolutePath() + "\n"
                + "sys_temp_dir=" + tmp.getAbsolutePath() + "\n"
                + "upload_tmp_dir=" + tmp.getAbsolutePath() + "\n"
                + "session.save_path=" + tmp.getAbsolutePath() + "\n"
                + "opcache.enable=1\nopcache.enable_cli=1\n");

        Map<String, String> env = environment(spike, database, storage, tmp, files);

        long tMigrate0 = System.nanoTime();
        String migrate = runToEnd(php, ini, serverDir, env, "artisan", "migrate", "--force", "--no-interaction");
        long tMigrated = System.nanoTime();

        port = freePort();
        env.put("APP_URL", "http://127.0.0.1:" + port);
        File router = new File(serverDir, "vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php");
        ProcessBuilder builder = new ProcessBuilder(php.getAbsolutePath(), "-c", ini.getAbsolutePath(), "-S", "127.0.0.1:" + port, router.getAbsolutePath());
        builder.directory(new File(serverDir, "public"));
        builder.environment().clear();
        builder.environment().putAll(env);
        builder.redirectErrorStream(true);
        builder.redirectOutput(new File(files, "php-server.log"));
        server = builder.start();
        try {
            waitForHealth(port, 20_000);
        } catch (Exception e) {
            // A process that never answered is not left behind for a retry to
            // mistake for a running server (#2050 review).
            stopServer();
            throw e;
        }
        long tReady = System.nanoTime();

        out.put("port", port);
        out.put("extracted", extracted);
        out.put("seeded", seeded);
        out.put("unpackMs", ms(t0, tExtracted));
        out.put("migrateMs", ms(tMigrate0, tMigrated));
        out.put("serverMs", ms(tMigrated, tReady));
        out.put("totalMs", ms(t0, tReady));
        out.put("migrateOutput", tail(migrate, 400));
        return out;
    }

    /** The desktop's environment (desktop/src/php-runtime.ts), with the phone's paths. */
    private Map<String, String> environment(JSONObject spike, File database, File storage, File tmp, File home) throws Exception {
        Map<String, String> env = new HashMap<>();
        env.put("HOME", home.getAbsolutePath());
        env.put("TMPDIR", tmp.getAbsolutePath());
        env.put("PHP_INI_SCAN_DIR", "");
        env.put("BUDOJO_RUNTIME", "desktop");
        env.put("APP_NAME", "Budojo");
        env.put("APP_ENV", "production");
        env.put("APP_DEBUG", "false");
        env.put("APP_KEY", spike.getString("appKey"));
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
        return env;
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

    private static void waitForHealth(int port, long timeoutMs) throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:" + port + "/api/v1/health").openConnection();
                connection.setConnectTimeout(500);
                connection.setReadTimeout(2000);
                if (connection.getResponseCode() == 200) {
                    return;
                }
            } catch (IOException ignored) {
                // Not listening yet.
            }
            Thread.sleep(50);
        }
        throw new IOException("the server did not answer /api/v1/health within " + timeoutMs + " ms");
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

    private void copyAsset(String name, File target) throws IOException {
        try (InputStream in = getContext().getAssets().open(name); OutputStream out = new FileOutputStream(target)) {
            copy(in, out);
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
