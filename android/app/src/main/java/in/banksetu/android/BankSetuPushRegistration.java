package in.banksetu.android;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

/** Keystore-protected user refresh credential, never a service-account credential. */
final class BankSetuPushRegistration {
    private static final String ALIAS="banksetu.push.auth.v1";
    private static final String REFRESH_WORK="banksetu-push-registration-refresh";
    private static final java.util.concurrent.ExecutorService executor=Executors.newSingleThreadExecutor();
    private static SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(ALIAS)){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();}
        return (SecretKey)store.getKey(ALIAS,null);
    }
    static synchronized void bind(Context context,JSONObject value)throws Exception{
        String worker=value.optString("worker"),uid=value.optString("uid"),tenant=value.optString("tenantId");
        if(!worker.equals("https://banksetu-client-api.banksetu2026.workers.dev")||uid.isEmpty()||uid.length()>128||tenant.isEmpty()||value.optString("refreshToken").isEmpty())throw new Exception("Invalid push account binding.");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        String encrypted=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
        context.getSharedPreferences("banksetu_push",Context.MODE_PRIVATE).edit().putString("binding",encrypted).putString("uid",uid).putString("tenantId",tenant).apply();
        schedule(context);
    }
    static synchronized void clear(Context context){context.getSharedPreferences("banksetu_push",Context.MODE_PRIVATE).edit().clear().apply();WorkManager.getInstance(context).cancelUniqueWork(REFRESH_WORK);((android.app.NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE)).cancelAll();}
    static void schedule(Context context){
        if(context.getSharedPreferences("banksetu_push",Context.MODE_PRIVATE).getString("binding","").isEmpty())return;
        Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest work=new PeriodicWorkRequest.Builder(BankSetuPushRefreshWorker.class,7,TimeUnit.DAYS).setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(REFRESH_WORK,ExistingPeriodicWorkPolicy.KEEP,work);
    }
    private static synchronized JSONObject read(Context context)throws Exception{
        String encoded=context.getSharedPreferences("banksetu_push",Context.MODE_PRIVATE).getString("binding","");if(encoded.isEmpty())return null;
        String[] parts=encoded.split(":",2);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8));
    }
    private static JSONObject post(String url,String contentType,String body,String token)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)new URL(url).openConnection();connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type",contentType);if(token!=null)connection.setRequestProperty("Authorization","Bearer "+token);
        try{connection.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));int status=connection.getResponseCode();if(status<200||status>=300)throw new Exception("Push registration unavailable: "+status);java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();try(java.io.InputStream input=connection.getInputStream()){byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1){bytes.write(buffer,0,count);if(bytes.size()>100000)throw new Exception("Invalid auth response.");}}return new JSONObject(bytes.toString("UTF-8"));}finally{connection.disconnect();}
    }
    static boolean refreshBlocking(Context context,String token){try{
        JSONObject account=read(context);if(account==null)return false;String original=context.getSharedPreferences("banksetu_push",Context.MODE_PRIVATE).getString("binding","");
        JSONObject auth=post("https://securetoken.googleapis.com/v1/token?key=AIzaSyDjm01ZjY9sHVtMLI9J2OG7HqR-w9lVnLo","application/x-www-form-urlencoded","grant_type=refresh_token&refresh_token="+java.net.URLEncoder.encode(account.getString("refreshToken"),"UTF-8"),null);
        if(!account.getString("uid").equals(auth.optString("user_id")))return false;
        if(!original.equals(context.getSharedPreferences("banksetu_push",Context.MODE_PRIVATE).getString("binding","")))return false;
          post(account.getString("worker")+"/push-register","application/json",new JSONObject().put("platform","android").put("scopedData",true).put("deviceId",account.getString("deviceId")).put("token",token).toString(),auth.getString("id_token"));
          synchronized(BankSetuPushRegistration.class){if(!original.equals(context.getSharedPreferences("banksetu_push",Context.MODE_PRIVATE).getString("binding","")))return false;
          account.put("refreshToken",auth.optString("refresh_token",account.getString("refreshToken")));bind(context,account);}
          return true;
    }catch(Exception ignored){return false;/* Offline delivery never blocks customer operations; WorkManager retries. */}}
    static void refresh(Context context,String token){executor.execute(()->refreshBlocking(context,token));}
}
