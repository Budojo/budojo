package it.budojo.mobile;

import android.app.KeyguardManager;
import android.content.Context;
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
 * <p>When to ask is the page's rule ({@code app-lock.service.ts}); this only
 * asks. It is AndroidX {@code biometric}, free and open source, where the
 * ready-made Capacitor plugins are paid (PRD § 5.1).
 *
 * <p>A phone with no screen lock has nothing to check against: the answer is
 * {@code unlocked} at once, with {@code secure: false}, and no prompt.
 */
@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {

    /** Weak counts the face unlock of most phones; the PIN is always there. */
    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void unlock(PluginCall call) {
        if (!isDeviceSecure()) {
            call.resolve(answer(true, false));
            return;
        }
        String title = call.getString("title", "Budojo");
        AppCompatActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            try {
                BiometricPrompt prompt = new BiometricPrompt(
                    activity,
                    ContextCompat.getMainExecutor(activity),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            call.resolve(answer(true, true));
                        }

                        @Override
                        public void onAuthenticationError(int code, @NonNull CharSequence message) {
                            if (!isDeviceSecure()) {
                                // The screen lock was removed meanwhile: as on a phone with none.
                                call.resolve(answer(true, false));
                                return;
                            }
                            JSObject refused = answer(false, true);
                            refused.put("code", code);
                            refused.put("message", message.toString());
                            call.resolve(refused);
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
                // The activity was going away, or the phone refused the prompt itself:
                // still locked, and the page shows why.
                JSObject refused = answer(false, true);
                refused.put("message", String.valueOf(error.getMessage()));
                call.resolve(refused);
            }
        });
    }

    private boolean isDeviceSecure() {
        KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isDeviceSecure();
    }

    private static JSObject answer(boolean unlocked, boolean secure) {
        JSObject answer = new JSObject();
        answer.put("unlocked", unlocked);
        answer.put("secure", secure);
        return answer;
    }
}
