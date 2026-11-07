package in.banksetu.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name="BankSetuLicenseClock")
public class BankSetuLicenseClockPlugin extends Plugin {
    private static final String ALIAS="banksetu-license-clock-v1";
    private static final long TOLERANCE=5*60*1000L;

    private SharedPreferences preferences(){return getContext().getSharedPreferences("banksetu_license_clock",Context.MODE_PRIVATE);}
    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return ((KeyStore.SecretKeyEntry)store.getEntry(ALIAS,null)).getSecretKey();
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private String encrypt(String value) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        byte[] iv=cipher.getIV(),encrypted=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),joined=new byte[iv.length+encrypted.length];
        System.arraycopy(iv,0,joined,0,iv.length);System.arraycopy(encrypted,0,joined,iv.length,encrypted.length);
        return Base64.encodeToString(joined,Base64.NO_WRAP);
    }
    private long read(String uid) throws Exception {
        String saved=preferences().getString(uid,null);if(saved==null)return 0;
        byte[] joined=Base64.decode(saved,Base64.NO_WRAP);if(joined.length<29)throw new Exception("Invalid protected clock");
        byte[] iv=new byte[12],encrypted=new byte[joined.length-12];System.arraycopy(joined,0,iv,0,12);System.arraycopy(joined,12,encrypted,0,encrypted.length);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,iv));
        String plain=new String(cipher.doFinal(encrypted),StandardCharsets.UTF_8),prefix=uid+":";
        if(!plain.startsWith(prefix))throw new Exception("Clock account mismatch");
        return Long.parseLong(plain.substring(prefix.length()));
    }
    private void save(String uid,long time) throws Exception {
        if(!preferences().edit().putString(uid,encrypt(uid+":"+time)).commit())throw new Exception("Protected clock could not be saved");
    }
    private String uid(PluginCall call){String uid=call.getString("uid","");return uid.length()<=128&&uid.matches("[^\\p{Cntrl}]+")?uid:"";}
    private Long time(PluginCall call){return call.getLong("time");}

    @PluginMethod public void observe(PluginCall call){
        getBridge().execute(()->{try{String uid=uid(call);Long time=time(call);if(uid.isEmpty()||time==null||time<=0)throw new Exception("Invalid trusted time");long prior=read(uid);if(time<prior-TOLERANCE)throw new Exception("Device date/time was changed");if(time>prior)save(uid,time);JSObject result=new JSObject();result.put("trusted",Math.max(prior,time));call.resolve(result);}catch(Exception error){call.reject("Device date/time could not be verified. Please connect your internet to verify the license.",error);}});
    }
    @PluginMethod public void verify(PluginCall call){
        getBridge().execute(()->{try{String uid=uid(call);Long time=time(call);if(uid.isEmpty()||time==null||time<=0)throw new Exception("Invalid trusted time");long prior=read(uid);if(prior<=0)throw new Exception("Protected clock missing");if(time<prior-TOLERANCE)throw new Exception("Device date/time was changed");if(time>prior)save(uid,time);call.resolve();}catch(Exception error){call.reject("Device date/time was changed. Please connect your internet to verify the license.",error);}});
    }
}
