package com.jornalir;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * Cria os canais de notificação do Android ANTES de qualquer notificação
 * chegar — inclusive com o app ainda nunca aberto pelo usuário, já que o
 * processo pode ser iniciado só para entregar uma mensagem em segundo
 * plano (Application.onCreate roda nesse caso; Activity.onCreate não).
 *
 * Canais são IMUTÁVEIS depois de criados (som/importância não mudam mais
 * por este código, só o usuário pode alterar manualmente nas
 * configurações do Android) — por isso o id leva um sufixo de versão
 * ("_v1"): se o som/comportamento precisar mudar no futuro, cria-se
 * jornal_ir_urgente_v2 em vez de tentar sobrescrever este (19/10/2026).
 */
public class JornalIrApplication extends Application {
    public static final String CHANNEL_NORMAL_ID = "jornal_ir_normal_v1";
    public static final String CHANNEL_URGENT_ID = "jornal_ir_urgente_v1";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels(this);
    }

    private static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return; // Canais só existem a partir do Android 8.

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        AudioAttributes notificationAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        // Normal: som padrão do sistema, importância padrão (sem vibração
        // forçada) — avisos do dia a dia, não devem incomodar como urgente.
        if (manager.getNotificationChannel(CHANNEL_NORMAL_ID) == null) {
            NotificationChannel normal = new NotificationChannel(
                    CHANNEL_NORMAL_ID,
                    "Jornal IR — Notícias",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            normal.setDescription("Avisos de novas notícias e destaques do Jornal IR.");
            manager.createNotificationChannel(normal);
        }

        // Urgente: importância alta (aparece como heads-up), vibração
        // quando o aparelho permitir, som próprio se o arquivo .ogg
        // estiver presente no APK — nunca falha silenciosamente: se o
        // áudio não estiver em res/raw, cai para o som padrão de
        // notificação em vez de ficar mudo ou quebrar a criação do canal.
        if (manager.getNotificationChannel(CHANNEL_URGENT_ID) == null) {
            NotificationChannel urgent = new NotificationChannel(
                    CHANNEL_URGENT_ID,
                    "Jornal IR — Urgente",
                    NotificationManager.IMPORTANCE_HIGH
            );
            urgent.setDescription("Alertas urgentes do Jornal IR — som e vibração distintos.");
            urgent.enableVibration(true);
            urgent.setVibrationPattern(new long[]{0, 250, 100, 250, 100, 350});
            urgent.enableLights(true);

            Uri urgentSound = resolveUrgentSoundUri(context);
            if (urgentSound != null) {
                urgent.setSound(urgentSound, notificationAttributes);
            }
            // Se urgentSound for null (arquivo ausente), NÃO chama setSound
            // — o canal fica com o som padrão de notificação do sistema em
            // vez de silencioso ou com um Uri inválido.

            manager.createNotificationChannel(urgent);
        }
    }

    /**
     * Resolve res/raw/jornal_ir_urgente.ogg por NOME (getIdentifier), não
     * por R.raw.jornal_ir_urgente — assim o projeto continua compilando
     * mesmo se o arquivo de áudio ainda não tiver sido copiado para a
     * pasta (ver docs/JORNAL-IR-PUSH-NATIVO-ANDROID-V0002-20261019.md).
     * Quando o arquivo existir, nenhuma mudança de código é necessária.
     */
    private static Uri resolveUrgentSoundUri(Context context) {
        int resId = context.getResources().getIdentifier("jornal_ir_urgente", "raw", context.getPackageName());
        if (resId == 0) return null;
        return Uri.parse("android.resource://" + context.getPackageName() + "/" + resId);
    }
}
