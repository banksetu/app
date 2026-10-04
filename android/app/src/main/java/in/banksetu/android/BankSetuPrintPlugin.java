package in.banksetu.android;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BankSetuPrint")
public class BankSetuPrintPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                if (manager == null) { call.reject("Print service unavailable"); return; }
                manager.print("Bank Setu", getBridge().getWebView().createPrintDocumentAdapter("Bank Setu"), new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception error) { call.reject("Could not print", error); }
        });
    }
}
