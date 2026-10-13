package in.banksetu.android;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** FCM runs without the Capacitor WebView when Android starts the app process for a push. */
public class BankSetuMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        // Refresh authenticated registration without requiring a WebView.
        getSharedPreferences("banksetu_push", MODE_PRIVATE).edit().putString("token", token).apply();
        BankSetuPushRegistration.refresh(this,token);
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        // Scoped data messages are validated before native presentation, including background delivery.
        BankSetuNotificationsPlugin.showPush(this, message);
    }
}
