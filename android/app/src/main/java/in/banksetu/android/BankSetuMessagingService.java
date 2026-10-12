package in.banksetu.android;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** FCM runs without the Capacitor WebView when Android starts the app process for a push. */
public class BankSetuMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        // Never log the token. The signed-in UI registers it with the authenticated Worker.
        getSharedPreferences("banksetu_push", MODE_PRIVATE).edit().putString("token", token).apply();
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        // The FCM notification payload is rendered by Android while backgrounded.
        // Foreground presentation is handled by the existing local notification bridge.
        if (message.getNotification() == null) return;
        BankSetuNotificationsPlugin.showPush(this, message);
    }
}
