package in.banksetu.android;

import android.os.StatFs;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.ArrayDeque;

@CapacitorPlugin(name="BankSetuStorage")
public class BankSetuStoragePlugin extends Plugin {
    @PluginMethod public void info(PluginCall call) {
        getBridge().execute(() -> {
            try {
                File data=getContext().getDataDir();
                StatFs volume=new StatFs(data.getAbsolutePath());
                long used=0; int scanned=0; boolean complete=true;
                ArrayDeque<File> pending=new ArrayDeque<>();pending.add(data);
                while(!pending.isEmpty()) {
                    File current=pending.removeFirst();
                    File[] children=current.listFiles();if(children==null){complete=false;continue;}
                    for(File child:children){
                        if(++scanned>100000){complete=false;pending.clear();break;}
                        if(child.isDirectory())pending.add(child);
                        else if(child.isFile())used+=Math.max(0,child.length());
                    }
                }
                JSObject result=new JSObject();
                result.put("totalBytes",volume.getTotalBytes());
                result.put("availableBytes",volume.getAvailableBytes());
                result.put("appDataBytes",used);
                result.put("appDataComplete",complete);
                call.resolve(result);
            }catch(Exception error){call.reject("Storage information is unavailable.",error);}
        });
    }
}
