package in.banksetu.android;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        BankSetuNotificationsPlugin.createChannels(this);
        registerPlugin(BankSetuPrintPlugin.class);
        registerPlugin(BankSetuUpdatePlugin.class);
        registerPlugin(BankSetuSharePlugin.class);
        registerPlugin(BankSetuNotificationsPlugin.class);
        registerPlugin(BankSetuStoragePlugin.class);
        super.onCreate(state);
    }
}
