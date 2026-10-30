package in.banksetu.android;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.RemoteMessage;

@CapacitorPlugin(name="BankSetuNotifications", permissions={@Permission(alias="system", strings={Manifest.permission.POST_NOTIFICATIONS})})
public class BankSetuNotificationsPlugin extends Plugin {
    @PluginMethod public void requestPermissions(PluginCall call) {
        // FCM can arrive before the first in-app alert. Its declared channel
        // must already exist when Android displays a background message.
        createChannels(getContext());
        if (Build.VERSION.SDK_INT >= 33 && !hasRequiredPermissions()) { requestPermissionForAlias("system", call, "permissionResult"); return; }
        permissionResult(call);
    }
    static void createChannels(android.content.Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        for (String category : new String[]{"license", "update", "sync", "network", "support"}) {
            NotificationChannel channel=new NotificationChannel("banksetu_" + category, category.equals("support")?"Support messages":category + " alerts", category.equals("support")?NotificationManager.IMPORTANCE_HIGH:NotificationManager.IMPORTANCE_DEFAULT);
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }
    }
    @PermissionCallback public void permissionResult(PluginCall call) {
        JSObject result=new JSObject();
        result.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled() && (Build.VERSION.SDK_INT < 33 || hasRequiredPermissions()));
        call.resolve(result);
    }
    @PluginMethod public void show(PluginCall call) {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled() || (Build.VERSION.SDK_INT >= 33 && !hasRequiredPermissions())) { call.resolve(); return; }
        String category=call.getString("category", "sync"),page=call.getString("page", "dashboard");
        if (!category.matches("update|sync|network|license|support") || !page.matches("dashboard|sync-backup|license-management|support")) { call.reject("Invalid notification route."); return; }
        String title=call.getString("title", "Bank Setu"),body=call.getString("body", "");
        if (title.length()>100 || body.length()>250) { call.reject("Notification is too long."); return; }
        NotificationManager manager=(NotificationManager)getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        String channel="banksetu_"+category;
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel(channel,category.equals("license")?"License alerts":category.equals("sync")?"Sync alerts":category.equals("update")?"Updates":category.equals("support")?"Support messages":"Connection alerts",category.equals("support")?NotificationManager.IMPORTANCE_HIGH:NotificationManager.IMPORTANCE_DEFAULT));
        int id=call.getInt("id", 1);
        Intent intent=new Intent(getContext(),MainActivity.class);intent.setAction("banksetu.notification."+id);intent.putExtra("banksetuPage",page);
        PendingIntent pending=PendingIntent.getActivity(getContext(),id,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        manager.notify(id,new NotificationCompat.Builder(getContext(),channel).setSmallIcon(R.drawable.ic_stat_banksetu).setContentTitle(title).setContentText(body).setPriority(category.equals("support")?NotificationCompat.PRIORITY_HIGH:NotificationCompat.PRIORITY_DEFAULT).setOnlyAlertOnce(true).setAutoCancel(true).setContentIntent(pending).build());
        call.resolve();
    }
    @PluginMethod public void bindPushAccount(PluginCall call) {
        try { BankSetuPushRegistration.bind(getContext(),new org.json.JSONObject(call.getData().toString()));call.resolve(); }
        catch(Exception error){call.reject("Secure push binding is unavailable.");}
    }
    @PluginMethod public void getPushToken(PluginCall call) {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null) { call.reject("FCM registration is unavailable."); return; }
            JSObject result = new JSObject(); result.put("token", task.getResult()); call.resolve(result);
        });
    }
    @PluginMethod public void clearPushToken(PluginCall call) {
        BankSetuPushRegistration.clear(getContext());
        FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener(task -> {
            getContext().getSharedPreferences("banksetu_push", android.content.Context.MODE_PRIVATE).edit().remove("token").apply();
            if (task.isSuccessful()) call.resolve(); else call.reject("FCM token could not be invalidated.");
        });
    }
    static void showPush(android.content.Context context, RemoteMessage message) {
        String page = message.getData().get("page");
        String category = message.getData().get("category");
        if (page == null || !page.matches("dashboard|sync-backup|license-management|support") || category == null || !category.matches("update|sync|network|license|support")) return;
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        android.content.SharedPreferences prefs=context.getSharedPreferences("banksetu_push",android.content.Context.MODE_PRIVATE);
        if(prefs.getString("uid","").isEmpty()||!prefs.getString("uid","").equals(message.getData().get("uid"))||!prefs.getString("tenantId","").equals(message.getData().get("tenantId")))return;
        String title=message.getData().get("title"),body=message.getData().get("body");
        if(title==null||body==null||title.length()>100||body.length()>250)return;
        NotificationManager manager = (NotificationManager) context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        String channel = "banksetu_" + category;
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(channel, category.equals("support")?"Support messages":category + " alerts", category.equals("support")?NotificationManager.IMPORTANCE_HIGH:NotificationManager.IMPORTANCE_DEFAULT));
        String event = message.getData().get("eventId");
        if(event==null||event.length()>128)return;
        try{org.json.JSONArray seen=new org.json.JSONArray(prefs.getString("events","[]"));String key=message.getData().get("tenantId")+":"+event;for(int index=0;index<seen.length();index++)if(key.equals(seen.optString(index)))return;seen.put(key);while(seen.length()>100)seen.remove(0);prefs.edit().putString("events",seen.toString()).apply();}catch(org.json.JSONException ignored){return;}
        int id = event == null ? (int) System.currentTimeMillis() : event.hashCode();
        Intent intent = new Intent(context, MainActivity.class); intent.setAction("banksetu.push." + id); intent.putExtra("banksetuPage", page);
        PendingIntent pending = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        manager.notify(id, new NotificationCompat.Builder(context, channel).setSmallIcon(R.drawable.ic_stat_banksetu).setContentTitle(title).setContentText(body).setPriority(category.equals("support")?NotificationCompat.PRIORITY_HIGH:NotificationCompat.PRIORITY_DEFAULT).setOnlyAlertOnce(true).setAutoCancel(true).setContentIntent(pending).build());
    }
    @Override protected void handleOnNewIntent(Intent intent) { super.handleOnNewIntent(intent); String page=intent.getStringExtra("banksetuPage");if(page==null)page=intent.getStringExtra("page");if(page!=null){JSObject value=new JSObject();value.put("page",page);notifyListeners("notificationOpened",value);intent.removeExtra("banksetuPage");intent.removeExtra("page");} }
    @PluginMethod public void getPendingTap(PluginCall call) {JSObject result=new JSObject();Intent intent=getActivity().getIntent();String page=intent==null?null:intent.getStringExtra("banksetuPage");if(page==null&&intent!=null)page=intent.getStringExtra("page");if(page!=null){result.put("page",page);intent.removeExtra("banksetuPage");intent.removeExtra("page");}call.resolve(result);}
}
