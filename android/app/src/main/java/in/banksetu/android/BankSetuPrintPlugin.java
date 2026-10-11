package in.banksetu.android;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PageRange;
import android.os.ParcelFileDescriptor;
import android.os.CancellationSignal;
import android.util.Base64;
import java.io.FileOutputStream;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BankSetuPrint")
public class BankSetuPrintPlugin extends Plugin {
    @PluginMethod public void printPdf(PluginCall call) {
        String encoded=call.getString("base64");
        if(encoded==null || encoded.length()>40_000_000){call.reject("Invalid PDF size.");return;}
        byte[] bytes;
        try { bytes=Base64.decode(encoded,Base64.DEFAULT); }
        catch(Exception error){call.reject("Invalid PDF data.");return;}
        if(bytes.length<5 || bytes[0]!='%' || bytes[1]!='P' || bytes[2]!='D' || bytes[3]!='F') {call.reject("Invalid PDF file.");return;}
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager manager=(PrintManager)getActivity().getSystemService(Context.PRINT_SERVICE);
                if(manager==null){call.reject("Print service unavailable.");return;}
                PrintDocumentAdapter adapter=new PrintDocumentAdapter(){
                    @Override public void onLayout(PrintAttributes oldAttributes,PrintAttributes newAttributes,CancellationSignal cancellation,LayoutResultCallback callback,android.os.Bundle extras){
                        if(cancellation.isCanceled()){callback.onLayoutCancelled();return;}
                        callback.onLayoutFinished(new PrintDocumentInfo.Builder("BankSetu-customers.pdf").setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN).build(),true);
                    }
                    @Override public void onWrite(PageRange[] pages,ParcelFileDescriptor destination,CancellationSignal cancellation,WriteResultCallback callback){
                        try(FileOutputStream output=new FileOutputStream(destination.getFileDescriptor())){
                            if(cancellation.isCanceled()){callback.onWriteCancelled();return;}
                            output.write(bytes);output.flush();callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                        }catch(Exception error){callback.onWriteFailed("Could not prepare PDF for printing.");}
                    }
                };
                manager.print("Bank Setu Customers",adapter,new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                call.resolve(); // Dialog opened; a print job or cancellation is not claimed.
            }catch(Exception error){call.reject("Could not open Android print dialog.",error);}
        });
    }
    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                if (manager == null) { call.reject("Print service unavailable"); return; }
                PrintAttributes.Builder attributes = new PrintAttributes.Builder();
                if (call.getBoolean("duplex", false)) attributes.setDuplexMode(PrintAttributes.DUPLEX_MODE_LONG_EDGE);
                manager.print("Bank Setu", getBridge().getWebView().createPrintDocumentAdapter("Bank Setu"), attributes.build());
                call.resolve();
            } catch (Exception error) { call.reject("Could not print", error); }
        });
    }
}
