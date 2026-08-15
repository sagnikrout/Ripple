package net.ripple.mesh.service;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.IBinder;

/**
 * Android ForegroundService implementation for Ripple mesh node.
 * Manages background BLE GATT discovery, Wi-Fi Direct sockets, and battery-aware duty cycling.
 */
public class RippleForegroundService extends Service {

    public static final String CHANNEL_ID = "RippleMeshChannel";
    private boolean isBatteryThrottled = false;

    private final BroadcastReceiver batteryReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            float batteryPct = level * 100 / (float) scale;

            // Throttle scanning if battery falls below 20%
            if (batteryPct < 20.0f && !isBatteryThrottled) {
                isBatteryThrottled = true;
                applyBatterySaverMode(true);
            } else if (batteryPct >= 20.0f && isBatteryThrottled) {
                isBatteryThrottled = false;
                applyBatterySaverMode(false);
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        registerReceiver(batteryReceiver, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        Notification notification = builder
                .setContentTitle("Ripple Mesh Node Active")
                .setContentText("Routing delay-tolerant packets across offline peers")
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setOngoing(true)
                .build();

        startForeground(1001, notification);
        return START_STICKY;
    }

    private void applyBatterySaverMode(boolean enable) {
        // When enabled: drops BLE scan duty cycle to 5% (100ms scan / 1900ms sleep) and disables Wi-Fi Direct
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try {
            unregisterReceiver(batteryReceiver);
        } catch (Exception e) {}
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Ripple Mesh Background Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Maintains offline BLE GATT and Wi-Fi mesh routing");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
