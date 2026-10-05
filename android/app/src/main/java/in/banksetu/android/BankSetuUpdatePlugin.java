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
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("url", "");
        if (downloadUrl == null || !downloadUrl.startsWith("https://github.com/banksetu/app/releases/download/")) {
            call.reject("Invalid Bank Setu update URL.");
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(downloadUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept", "application/octet-stream");
                connection.connect();

                if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
                    throw new IllegalStateException("APK download returned HTTP " + connection.getResponseCode());
                }

                long total = connection.getContentLengthLong();
                long downloaded = 0;
                File apk = new File(getContext().getCacheDir(), "banksetu-update.apk");
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(apk, false)) {
                    byte[] buffer = new byte[32 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                        downloaded += count;
                        JSObject progress = new JSObject();
                        progress.put("downloaded", downloaded);
                        progress.put("total", total);
                        progress.put("percent", total > 0 ? Math.min(100, (downloaded * 100) / total) : -1);
                        notifyListeners("downloadProgress", progress);
                    }
                    output.flush();
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
