package it.budojo.mobile;

import android.app.Activity;
import android.content.Intent;
import android.os.SystemClock;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Scope;
import java.util.Arrays;

/**
 * Google Drive from the phone (#2028, the spike): the phone's counterpart of the
 * desktop's {@code drive-auth.ts}.
 *
 * <p>A thin bridge around Google's {@code AuthorizationClient}, scope
 * {@code drive.file}. The first call shows Google's consent screen; later calls
 * return an access token with no UI, because Google Play services keeps the
 * grant. Nothing is stored here: no refresh token, no account. The Drive calls
 * themselves are made by the page.
 *
 * <p>Google matches the app to the project's Android OAuth client by package
 * name and signing certificate, so no client id appears in the app. An APK
 * signed with any key but the release key gets {@code DEVELOPER_ERROR} (10).
 */
@CapacitorPlugin(name = "DriveAuth")
public class DriveAuthPlugin extends Plugin {

    static final String DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";

    /**
     * The account's hidden application data, where the PC puts the academy's
     * keys (#2033). Asked with {@code drive.file}: Google shows the consent
     * once more to a phone granted only the first.
     */
    static final String DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata";

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall consentCall;
    private long consentStarted;

    @Override
    public void load() {
        // Registered while the activity is being created, as the launcher API requires.
        consentLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::onConsent
        );
    }

    /** Whether Google Play services is there: AuthorizationClient needs it. */
    @PluginMethod
    public void status(PluginCall call) {
        GoogleApiAvailability availability = GoogleApiAvailability.getInstance();
        int code = availability.isGooglePlayServicesAvailable(getContext());
        JSObject result = new JSObject();
        result.put("playServices", code == ConnectionResult.SUCCESS ? "ok" : availability.getErrorString(code));
        call.resolve(result);
    }

    /**
     * An access token for {@code drive.file}. With {@code interactive: false} it
     * never shows anything: when Google needs the owner's consent it rejects
     * with {@code NEEDS_CONSENT}, which is how the page tells "connected" from
     * "not yet" at launch.
     */
    @PluginMethod
    public void authorize(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        long started = SystemClock.elapsedRealtime();
        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Arrays.asList(new Scope(DRIVE_FILE), new Scope(DRIVE_APPDATA)))
            .build();

        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    call.resolve(toJs(result, started, false));
                    return;
                }
                if (!interactive) {
                    call.reject("Google needs the owner's consent", "NEEDS_CONSENT");
                    return;
                }
                if (consentCall != null) {
                    call.reject("Google's consent screen is already open", "BUSY");
                    return;
                }
                consentCall = call;
                consentStarted = started;
                consentLauncher.launch(new IntentSenderRequest.Builder(result.getPendingIntent().getIntentSender()).build());
            })
            .addOnFailureListener(e -> reject(call, e));
    }

    /**
     * Forgets a token Google Play services cached, so the next
     * {@code authorize} fetches a fresh one. The page calls it when Drive
     * answers 401 with a token Google still handed out.
     */
    @PluginMethod
    public void clearToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null) {
            call.reject("token is required");
            return;
        }
        Identity.getAuthorizationClient(getActivity())
            .clearToken(ClearTokenRequest.builder().setToken(token).build())
            .addOnSuccessListener(ignored -> call.resolve())
            .addOnFailureListener(e -> reject(call, e));
    }

    private void onConsent(ActivityResult activityResult) {
        PluginCall call = consentCall;
        consentCall = null;
        if (call == null) {
            return;
        }
        Intent data = activityResult.getData();
        if (data == null) {
            call.reject("The consent screen was closed", activityResult.getResultCode() == Activity.RESULT_CANCELED ? "CANCELLED" : "NO_RESULT");
            return;
        }
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(data);
            call.resolve(toJs(result, consentStarted, true));
        } catch (ApiException e) {
            reject(call, e);
        }
    }

    /** The token goes to the page and nowhere else: never into a log. */
    private static JSObject toJs(AuthorizationResult result, long started, boolean consented) {
        JSObject js = new JSObject();
        js.put("accessToken", result.getAccessToken());
        js.put("grantedScopes", new JSArray(result.getGrantedScopes()));
        js.put("consented", consented);
        js.put("ms", SystemClock.elapsedRealtime() - started);
        return js;
    }

    /** Google's status code by name, because the screen is the only log the owner can send. */
    private static void reject(PluginCall call, Exception e) {
        if (e instanceof ApiException) {
            int status = ((ApiException) e).getStatusCode();
            call.reject(
                "Google: " + CommonStatusCodes.getStatusCodeString(status) + " (" + status + ") " + e.getMessage(),
                "GOOGLE_" + status,
                e
            );
            return;
        }
        call.reject(e.getClass().getSimpleName() + ": " + e.getMessage(), e);
    }
}
