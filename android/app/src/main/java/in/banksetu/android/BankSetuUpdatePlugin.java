package in.banksetu.android;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "BankSetuUpdate")
public class BankSetuUpdatePlugin extends Plugin {
    private static final long MAX_APK_BYTES = 200L * 1024L * 1024L;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("url", "");
        URL requested;
        try { requested = new URL(downloadUrl); }
        catch (Exception error) { call.reject("Invalid Bank Setu update URL."); return; }
        if (!"https".equalsIgnoreCase(requested.getProtocol()) || !"github.com".equalsIgnoreCase(requested.getHost()) ||
            !requested.getPath().startsWith("/banksetu/app/releases/download/") || requested.getUserInfo() != null || requested.getQuery() != null || requested.getRef() != null) {
            call.reject("Invalid Bank Setu update URL.");
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) requested.openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept", "application/octet-stream");
                connection.connect();

                if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
                    throw new IllegalStateException("APK download returned HTTP " + connection.getResponseCode());
                }
                if (!"https".equalsIgnoreCase(connection.getURL().getProtocol())) throw new IllegalStateException("APK download left the secure connection.");

                long total = connection.getContentLengthLong();
                if (total > MAX_APK_BYTES) throw new IllegalStateException("APK download is too large.");
                long downloaded = 0;
                File apk = new File(getContext().getCacheDir(), "banksetu-update.apk");
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(apk, false)) {
                    byte[] buffer = new byte[32 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                        downloaded += count;
                        if (downloaded > MAX_APK_BYTES) throw new IllegalStateException("APK download is too large.");
                        JSObject progress = new JSObject();
                        progress.put("downloaded", downloaded);
                        progress.put("total", total);
                        progress.put("percent", total > 0 ? Math.min(100, (downloaded * 100) / total) : -1);
                        notifyListeners("downloadProgress", progress);
                    }
                    output.flush();
                }
                try (InputStream verify = new java.io.FileInputStream(apk)) {
                    if (verify.read() != 'P' || verify.read() != 'K' || verify.read() != 3 || verify.read() != 4) {
                        apk.delete();
                        throw new IllegalStateException("Downloaded update is not an APK file.");
                    }
                }

                Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apk
                );
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getContext().startActivity(install);
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "APK download failed." : error.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }
}
