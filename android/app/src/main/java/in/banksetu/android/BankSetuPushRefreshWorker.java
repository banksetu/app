package in.banksetu.android;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.concurrent.TimeUnit;

/** Keeps the server-side FCM registration alive while the app is not running. */
public final class BankSetuPushRefreshWorker extends Worker {
    public BankSetuPushRefreshWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}
    @NonNull @Override public Result doWork(){
        try{
            String token=Tasks.await(FirebaseMessaging.getInstance().getToken(),20,TimeUnit.SECONDS);
            return token!=null&&!token.isEmpty()&&BankSetuPushRegistration.refreshBlocking(getApplicationContext(),token)?Result.success():Result.retry();
        }catch(Exception ignored){return Result.retry();}
    }
}
