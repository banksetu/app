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

@CapacitorPlugin(name="BankSetuNotifications", permissions={@Permission(alias="system", strings={Manifest.permission.POST_NOTIFICATIONS})})
public class BankSetuNotificationsPlugin extends Plugin {
    @PluginMethod public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && !hasRequiredPermissions()) { requestPermissionForAlias("system", call, "permissionResult"); return; }
        permissionResult(call);
    }
    @PermissionCallback public void permissionResult(PluginCall call) {
        JSObject result=new JSObject();
        result.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled() && (Build.VERSION.SDK_INT < 33 || hasRequiredPermissions()));
        call.resolve(result);
    }
    @PluginMethod public void show(PluginCall call) {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled() || (Build.VERSION.SDK_INT >= 33 && !hasRequiredPermissions())) { call.resolve(); return; }
        String category=call.getString("category", "sync"),page=call.getString("page", "dashboard");
        if (!category.matches("update|sync|network|license") || !page.matches("dashboard|sync-backup|license-management")) { call.reject("Invalid notification route."); return; }
        String title=call.getString("title", "Bank Setu"),body=call.getString("body", "");
        if (title.length()>100 || body.length()>250) { call.reject("Notification is too long."); return; }
        NotificationManager manager=(NotificationManager)getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        String channel="banksetu_"+category;
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel(channel,category.equals("license")?"License alerts":category.equals("sync")?"Sync alerts":category.equals("update")?"Updates":"Connection alerts",NotificationManager.IMPORTANCE_DEFAULT));
        int id=call.getInt("id", 1);
        Intent intent=new Intent(getContext(),MainActivity.class);intent.setAction("banksetu.notification."+id);intent.putExtra("banksetuPage",page);
        PendingIntent pending=PendingIntent.getActivity(getContext(),id,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        manager.notify(id,new NotificationCompat.Builder(getContext(),channel).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body).setAutoCancel(true).setContentIntent(pending).build());
        call.resolve();
    }
    @Override protected void handleOnNewIntent(Intent intent) { super.handleOnNewIntent(intent); String page=intent.getStringExtra("banksetuPage");if(page!=null){JSObject value=new JSObject();value.put("page",page);notifyListeners("notificationOpened",value);intent.removeExtra("banksetuPage");} }
    @PluginMethod public void getPendingTap(PluginCall call) {JSObject result=new JSObject();Intent intent=getActivity().getIntent();String page=intent==null?null:intent.getStringExtra("banksetuPage");if(page!=null){result.put("page",page);intent.removeExtra("banksetuPage");}call.resolve(result);}
}
