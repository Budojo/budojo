package it.budojo.mobile;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The fingerprint lock (#2159, PRD § 6.1): Android's own biometric prompt,
 * with the phone's PIN, pattern or password as the fallback inside it. On a
 * phone with no fingerprint, the screen lock alone.
 *
 * <p>When to ask is the page's rule ({@code app-lock.service.ts}). This asks,
 * and keeps the two facts the rule needs where the page cannot lose or bend
 * them: whether Budojo was unlocked since this screen opened, and the longest
 * time it then spent in the background. They outlive a reload of the page (a
 * sync pull reloads it), and the time is {@code elapsedRealtime}: setting the
 * phone's clock back does not move it, and it keeps counting while the phone
 * sleeps.
 *
 * <p>It is AndroidX {@code biometric}, free and open source, where the
 * ready-made Capacitor plugins are paid (PRD § 5.1). A phone with no screen
 * lock has nothing to check against: {@code unlocked} at once, with
 * {@code secure: false}, and no prompt.
 */
@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {

    /** Weak counts the face unlock of most phones; the PIN is always there. */
    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    /** BiometricPrompt's ERROR_CANCELED: the page asks again once the app is back. */
    private static final int NOT_IN_FRONT = 5;

    /** ERROR_USER_CANCELED and ERROR_NEGATIVE_BUTTON: closed by a tap or Back. */
    private static final int USER_CANCELED = 10;
    private static final int NEGATIVE_BUTTON = 13;

    // Written on the main thread by the lifecycle and the prompt, read on the
    // plugin's own thread by state().
    private volatile boolean unlocked = false;
    private volatile long leftAt = -1;
    private volatile long longestAway = 0;
    private volatile boolean closedByOwner = false;

    @Override
    protected void handleOnStop() {
        leftAt = SystemClock.elapsedRealtime();
        // Leaving is what makes coming back an opening again.
        closedByOwner = false;
    }

    @Override
    protected void handleOnStart() {
        if (leftAt >= 0) {
            longestAway = Math.max(longestAway, SystemClock.elapsedRealtime() - leftAt);
            leftAt = -1;
        }
    }

    /**
     * Unlocked since this screen opened, the longest time away since then, and
     * whether the owner closed the last prompt without leaving the app.
     */
    @PluginMethod
    public void state(PluginCall call) {
        JSObject state = new JSObject();
        state.put("unlocked", unlocked);
        state.put("away", longestAway);
        state.put("closed", closedByOwner);
        call.resolve(state);
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        if (!isDeviceSecure()) {
            opened();
            call.resolve(answer(true, false));
            return;
        }
        String title = call.getString("title", "Budojo");
        AppCompatActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            // In the background the prompt would never show nor answer
            // (biometric 1.1.0 drops it once the state is saved): say so, and
            // the page asks again when the app is back.
            if (activity.getSupportFragmentManager().isStateSaved()) {
                call.resolve(refused(NOT_IN_FRONT, "Budojo is not on the screen"));
                return;
            }
            try {
                BiometricPrompt prompt = new BiometricPrompt(
                    activity,
                    ContextCompat.getMainExecutor(activity),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            opened();
                            call.resolve(answer(true, true));
                        }

                        @Override
                        public void onAuthenticationError(int code, @NonNull CharSequence message) {
                            if (!isDeviceSecure()) {
                                // The screen lock was removed meanwhile: as on a phone with none.
                                opened();
                                call.resolve(answer(true, false));
                                return;
                            }
                            // Since Android 10 a prompt that goes away with the app answers
                            // USER_CANCELED too: only one closed with the app on the screen
                            // is the owner's choice. Before Android 11 the PIN is its own
                            // screen, and the app is back on it before this answer comes.
                            boolean onScreen = !activity.getSupportFragmentManager().isStateSaved();
                            if (onScreen && (code == USER_CANCELED || code == NEGATIVE_BUTTON)) {
                                closedByOwner = true;
                            }
                            call.resolve(refused(code, message.toString()));
                        }
                        // onAuthenticationFailed, a finger not recognised: the prompt stays
                        // up and says so itself.
                    }
                );
                prompt.authenticate(
                    new BiometricPrompt.PromptInfo.Builder()
                        .setTitle(title)
                        .setAllowedAuthenticators(AUTHENTICATORS)
                        .build()
                );
            } catch (RuntimeException error) {
                // The phone refused the prompt itself: still locked, and the page shows why.
                JSObject failed = answer(false, true);
                failed.put("message", String.valueOf(error.getMessage()));
                call.resolve(failed);
            }
        });
    }

    /**
     * Unlocked from now on. Before Android 11 the PIN is its own screen: the
     * time spent on it was counted as away when the app came back, and is not
     * time away.
     */
    private void opened() {
        unlocked = true;
        longestAway = 0;
        closedByOwner = false;
    }

    private boolean isDeviceSecure() {
        KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isDeviceSecure();
    }

    private static JSObject refused(int code, String message) {
        JSObject refused = answer(false, true);
        refused.put("code", code);
        refused.put("message", message);
        return refused;
    }

    private static JSObject answer(boolean unlocked, boolean secure) {
        JSObject answer = new JSObject();
        answer.put("unlocked", unlocked);
        answer.put("secure", secure);
        return answer;
    }
}
