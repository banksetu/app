package in.banksetu.android;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "BankSetuShare")
public class BankSetuSharePlugin extends Plugin {
    @PluginMethod
    public void shareImage(PluginCall call) {
        String encoded = call.getString("base64");
        if (encoded == null || encoded.length() > 12 * 1024 * 1024) {
            call.reject("Invalid customer preview image.");
            return;
        }
        try {
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > 8 * 1024 * 1024) {
                call.reject("Customer preview image is too large.");
                return;
            }
            File image = new File(getContext().getCacheDir(), "BankSetu-preview-" + UUID.randomUUID() + ".png");
            try (FileOutputStream output = new FileOutputStream(image)) { output.write(bytes); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", image);
            getActivity().runOnUiThread(() -> {
                try {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("image/png");
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.setClipData(ClipData.newRawUri("Bank Setu customer preview", uri));
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    getActivity().startActivity(Intent.createChooser(send, "Share customer preview"));
                    call.resolve(); // The chooser launched; delivery depends on the selected app.
                } catch (Exception error) { call.reject("Could not open Android share options.", error); }
            });
        } catch (Exception error) { call.reject("Could not prepare customer preview image.", error); }
    }
}
