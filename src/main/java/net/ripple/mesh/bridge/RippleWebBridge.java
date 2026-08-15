package net.ripple.mesh.bridge;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

/**
 * JavaScriptInterface Bridge connecting the SMS Web GUI to native Android & Ripple core.
 */
public class RippleWebBridge {

    private final Context context;

    public RippleWebBridge(Context context) {
        this.context = context;
    }

    @JavascriptInterface
    public void showToast(String message) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show();
    }

    @JavascriptInterface
    public String getBatteryLevel() {
        return "88%";
    }

    @JavascriptInterface
    public boolean isBluetoothActive() {
        return true;
    }

    @JavascriptInterface
    public void notifyMessageDelivered(String messageId) {
        // Native delivery notification callback
    }
}
