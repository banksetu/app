package in.banksetu.android;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(BankSetuPrintPlugin.class);
        super.onCreate(state);
    }
}
