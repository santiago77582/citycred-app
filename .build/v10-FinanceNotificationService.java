package com.gastocontrol.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

public class FinanceNotificationService extends NotificationListenerService {
    private static final String CHANNEL = "gastocontrol_monitor";
    private static final int STATUS_ID = 76001;

    @Override public void onCreate() {
        super.onCreate();
        ListenerWatchdog.schedule(getApplicationContext());
    }

    @Override public void onListenerConnected() {
        super.onListenerConnected();
        health().edit()
                .putBoolean("connected", true)
                .putLong("connected_at", System.currentTimeMillis())
                .apply();
        showStatusNotification();
        // Recover financial notifications that are still visible in the shade.
        // This helps after a restart/rebind if a payment notification arrived while
        // the process was not connected for a short period.
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active != null) for (StatusBarNotification sbn : active) process(sbn, true);
        } catch (Exception ignored) {}
    }

    @Override public void onListenerDisconnected() {
        super.onListenerDisconnected();
        health().edit().putBoolean("connected", false).apply();
        try { requestRebind(new ComponentName(this, FinanceNotificationService.class)); } catch (Exception ignored) {}
    }

    @Override public void onDestroy() {
        health().edit().putBoolean("connected", false).apply();
        super.onDestroy();
    }

    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        process(sbn, false);
    }

    private void process(StatusBarNotification sbn, boolean recovered) {
        if (sbn == null || sbn.getNotification() == null) return;
        if (getPackageName().equals(sbn.getPackageName())) return;

        Notification n = sbn.getNotification();
        String title = firstNonBlank(
                cs(n.extras, Notification.EXTRA_TITLE),
                cs(n.extras, Notification.EXTRA_TITLE_BIG)
        );
        String text = collectText(n);

        String appName = sbn.getPackageName();
        try {
            appName = getPackageManager().getApplicationLabel(
                    getPackageManager().getApplicationInfo(sbn.getPackageName(), 0)
            ).toString();
        } catch (Exception ignored) {}

        long now = System.currentTimeMillis();
        // Single source of truth: AppMonitorRegistry, the same catalog the user
        // edits in "Aplicaciones que uso". Previously the service read AppCatalog
        // while the screen wrote AppMonitorRegistry, so user choices had no effect.
        boolean financialSource = AppMonitorRegistry.shouldMonitor(getApplicationContext(), sbn.getPackageName(), appName);
        boolean trustedSource = AppMonitorRegistry.isTrustedFinancialSource(getApplicationContext(), sbn.getPackageName(), appName);
        health().edit()
                .putBoolean("connected", true)
                .putLong("last_notification_at", now)
                .putString("last_notification_app", appName)
                .apply();
        if (financialSource) health().edit()
                .putLong("last_financial_seen_at", now)
                .putString("last_financial_app", appName)
                .apply();

        // IMPORTANT: the user's app selection is authoritative. Previously the
        // parser still ran for every Android notification and a random app with
        // words such as "compra" or "pago" could create a false expense even
        // after the user disabled it. Only monitored sources reach the parser.
        if (!financialSource) return;

        ExpenseDbHelper db = new ExpenseDbHelper(getApplicationContext());
        boolean changed = false;
        try {
            NotificationParser.Parsed parsed = NotificationParser.parse(
                    sbn.getPackageName(), appName, title, text,
                    sbn.getPostTime() > 0 ? sbn.getPostTime() : now, trustedSource
            );
            if (parsed != null) {
                AppMonitorRegistry.recordSeen(getApplicationContext(), sbn.getPackageName(), appName);
                changed = db.insertParsed(parsed);
                health().edit()
                        .putLong("last_matched_at", now)
                        .putString("last_matched_app", appName)
                        .putString("last_match_type", parsed.direction)
                        .putLong("last_match_amount_bits", Double.doubleToRawLongBits(parsed.amount))
                        .apply();
            } else {
                // Gmail and provider apps may expose bill due dates in notifications.
                InvoiceParser.Parsed bill = InvoiceParser.parse(title, text, appName);
                if (bill != null && bill.dueDay > 0) {
                    db.upsertDetectedBill(bill.name, bill.amount, bill.dueDay, bill.category);
                    changed = true;
                } else if (financialSource) {
                    AppMonitorRegistry.recordSeen(getApplicationContext(), sbn.getPackageName(), appName);
                    health().edit()
                            .putLong("last_unmatched_financial_at", now)
                            .putString("last_unmatched_financial_app", appName)
                            .apply();
                }
            }
        } finally {
            db.close();
        }
        if (changed) GastoWidgetProvider.refresh(getApplicationContext());
        if (recovered && changed) showStatusNotification();
    }

    private String collectText(Notification n) {
        StringBuilder out = new StringBuilder();
        append(out, cs(n.extras, Notification.EXTRA_TEXT));
        append(out, cs(n.extras, Notification.EXTRA_BIG_TEXT));
        append(out, cs(n.extras, Notification.EXTRA_SUB_TEXT));
        append(out, cs(n.extras, Notification.EXTRA_SUMMARY_TEXT));
        append(out, cs(n.extras, Notification.EXTRA_INFO_TEXT));
        if (n.tickerText != null) append(out, n.tickerText.toString());

        try {
            CharSequence[] lines = n.extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null) for (CharSequence line : lines) if (line != null) append(out, line.toString());
        } catch (Exception ignored) {}

        // Some banking apps put useful strings in custom extras. Read only
        // CharSequence values; do not serialize arbitrary objects/bundles.
        try {
            Bundle b = n.extras;
            for (String key : b.keySet()) {
                Object v = b.get(key);
                if (v instanceof CharSequence && !key.equals(Notification.EXTRA_TITLE)) append(out, v.toString());
                else if (v instanceof CharSequence[]) for (CharSequence c : (CharSequence[]) v) if (c != null) append(out, c.toString());
            }
        } catch (Exception ignored) {}
        return out.toString().replaceAll("\\s+", " ").trim();
    }

    private void showStatusNotification() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Monitor automático", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Indica que GastoControl está escuchando movimientos financieros en segundo plano.");
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            Intent i = new Intent(this, MainActivity.class);
            PendingIntent pi = PendingIntent.getActivity(this, 0, i,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
            b.setSmallIcon(android.R.drawable.ic_menu_view)
                    .setContentTitle("GastoControl está atento")
                    .setContentText("Podés cerrar la app. Los movimientos siguen detectándose automáticamente.")
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setCategory(Notification.CATEGORY_SERVICE)
                    .setContentIntent(pi);
            nm.notify(STATUS_ID, b.build());
        } catch (Exception ignored) {}
    }

    private android.content.SharedPreferences health() {
        return getSharedPreferences("monitor_health", MODE_PRIVATE);
    }
    private static String cs(Bundle b, String key) {
        try { CharSequence c = b.getCharSequence(key); return c == null ? "" : c.toString(); }
        catch (Exception e) { return ""; }
    }
    private static String firstNonBlank(String... ss) {
        for (String s : ss) if (s != null && !s.isBlank()) return s;
        return "";
    }
    private static void append(StringBuilder sb, String s) {
        if (s == null || s.isBlank()) return;
        if (sb.length() > 0) sb.append(" | ");
        sb.append(s.trim());
    }
}
