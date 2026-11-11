package com.jornalir.controle;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

/**
 * App administrativo INDEPENDENTE do Jornal IR público.
 * Estes IDs são estáveis: Android 8+ não permite alterar som/vibração de
 * um canal existente via código. Alterar comportamento = criar canal v2.
 * O usuário e o sistema operacional mantêm o controle sobre os alertas.
 */
public class ControleApplication extends Application {
    public static final String CHANNEL_INFO = "ir_controle_avisos_v1";
    public static final String CHANNEL_SOUND = "ir_controle_lembrete_som_v1";
    public static final String CHANNEL_VIBRATION = "ir_controle_lembrete_vibracao_v1";
    public static final String CHANNEL_BOTH = "ir_controle_lembrete_ambos_v1";
    public static final String CHANNEL_SILENT = "ir_controle_lembrete_silencioso_v1";

    @Override public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        create(manager, CHANNEL_INFO, "Avisos internos", "Avisos gerais do sistema", true, false, false);
        create(manager, CHANNEL_SOUND, "Agenda — Som", "Lembretes da Agenda com som", true, false, true);
        create(manager, CHANNEL_VIBRATION, "Agenda — Vibração", "Lembretes da Agenda apenas com vibração", false, true, true);
        create(manager, CHANNEL_BOTH, "Agenda — Som e vibração", "Lembretes da Agenda com som e vibração", true, true, true);
        create(manager, CHANNEL_SILENT, "Agenda — Silencioso", "Lembretes da Agenda sem som ou vibração", false, false, false);
    }

    private void create(NotificationManager manager, String id, String name, String description,
                        boolean sound, boolean vibration, boolean important) {
        if (manager.getNotificationChannel(id) != null) return;
        NotificationChannel channel = new NotificationChannel(
                id, name, important ? NotificationManager.IMPORTANCE_HIGH : NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription(description);
        channel.enableVibration(vibration);
        if (vibration) channel.setVibrationPattern(new long[]{0L, 250L, 160L, 250L});
        if (sound) {
            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            if (soundUri != null) channel.setSound(soundUri, attrs);
        } else {
            channel.setSound(null, null);
        }
        manager.createNotificationChannel(channel);
    }
}
