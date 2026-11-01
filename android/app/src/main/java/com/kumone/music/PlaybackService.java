package com.kumone.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 后台播放服务（前台服务 + 系统媒体会话）。
 *
 * 为什么需要它（真机实证）：
 *   没有前台服务时，App 退到后台后，Activity / WebView 可能被系统回收 ——
 *   表现就是「放到后台，一曲结束后不继续播」，甚至「根本没法在后台播」。
 *   前台服务让进程留在「有前台服务」这一档，系统不会随手回收它，
 *   同时把 App 从后台限流（Doze / 自启管理 / 厂商省电）里捞出来 ——
 *   下一首的取址请求才能正常发出去。
 *
 * 它同时是**系统媒体会话**的宿主：锁屏 / 通知栏 / 耳机上的上一首·播放·下一首，
 * 都从这里回到界面层（MediaPlugin.dispatch → bridge.eval）。
 *
 * 不引入任何新依赖：用的是框架自带的 MediaSession（API 21+）。
 */
public class PlaybackService extends Service {

    private static final String TAG = "KumoneMedia";
    private static final String CHANNEL_ID = "kumone_playback";
    private static final int NOTIF_ID = 0x4B55;   // "KU"

    /** 通知栏按钮 / 媒体键的命令。 */
    public static final String ACTION_COMMAND = "com.kumone.music.command";
    public static final String EXTRA_COMMAND = "command";

    /** 正在跑的那个实例（进程内单例，更新状态不用绕 Intent）。 */
    private static volatile PlaybackService instance;

    private MediaSession session;
    private NotificationManager notificationManager;

    private String title = "";
    private String artist = "";
    private String album = "";
    private String cover = "";
    private boolean playing = false;
    private long position = 0L;
    private long duration = 0L;
    private Bitmap artwork;

    /* ------------------------------------------------------------ 入口 */

    /**
     * 发布播放状态。服务已在跑就直接更新；没在跑就把它拉起来。
     * @param context 上下文
     * @param data 状态（title / artist / album / cover / playing / position / duration）
     */
    public static void publish(Context context, Bundle data) {
        PlaybackService svc = instance;
        if (svc != null) {
            svc.apply(data);
            svc.refresh();
            return;
        }
        Intent intent = new Intent(context, PlaybackService.class);
        if (data != null) intent.putExtras(data);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            // 后台起前台服务被系统拒绝（Android 12+）：播放本身不受影响，记一笔就好
            Log.w(TAG, "无法启动前台播放服务：" + e.getMessage());
        }
    }

    /** 收工：停掉服务与媒体会话。 */
    public static void shutdown(Context context) {
        PlaybackService svc = instance;
        if (svc != null) {
            svc.stopSelf();
        }
        try {
            context.stopService(new Intent(context, PlaybackService.class));
        } catch (Exception ignored) {
            // 停不掉也没关系：服务会在进程结束时一起没
        }
    }

    /* ---------------------------------------------------------- 生命周期 */

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createChannel();

        session = new MediaSession(this, "KumoneSession");
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() { MediaPlugin.dispatch("play"); }

            @Override
            public void onPause() { MediaPlugin.dispatch("pause"); }

            @Override
            public void onSkipToNext() { MediaPlugin.dispatch("next"); }

            @Override
            public void onSkipToPrevious() { MediaPlugin.dispatch("prev"); }

            @Override
            public void onSeekTo(long pos) {
                MediaPlugin.dispatch("seek:" + pos);
            }
        });
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS
                | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                        | PlaybackState.ACTION_SEEK_TO)
                .setState(PlaybackState.STATE_PAUSED, 0, 0f)
                .build());
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_COMMAND.equals(intent.getAction())) {
            MediaPlugin.dispatch(intent.getStringExtra(EXTRA_COMMAND));
            ensureForeground();
            return START_STICKY;
        }
        if (intent != null && intent.getExtras() != null) apply(intent.getExtras());
        ensureForeground();
        refresh();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        try {
            if (session != null) {
                session.setActive(false);
                session.release();
                session = null;
            }
        } catch (Exception ignored) {
            // 释放失败不影响进程退出
        }
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /* ------------------------------------------------------------ 状态 */

    private void apply(Bundle data) {
        if (data == null) return;
        if (data.containsKey("title")) title = orEmpty(data.getString("title"));
        if (data.containsKey("artist")) artist = orEmpty(data.getString("artist"));
        if (data.containsKey("album")) album = orEmpty(data.getString("album"));
        if (data.containsKey("playing")) playing = data.getBoolean("playing", false);
        if (data.containsKey("position")) position = data.getLong("position", 0L);
        if (data.containsKey("duration")) duration = data.getLong("duration", 0L);
        if (data.containsKey("cover")) {
            String c = orEmpty(data.getString("cover"));
            if (!c.equals(cover)) {
                cover = c;
                artwork = null;   // 换了歌：封面重新拉
            }
        }
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }

    /** 把状态同步到媒体会话与通知栏。 */
    private void refresh() {
        if (session != null) {
            session.setPlaybackState(new PlaybackState.Builder()
                    .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                            | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                            | PlaybackState.ACTION_SEEK_TO)
                    .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                            position, playing ? 1.0f : 0f)
                    .build());
            try {
                MediaMetadata.Builder meta = new MediaMetadata.Builder()
                        .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                        .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                        .putString(MediaMetadata.METADATA_KEY_ALBUM, album);
                if (artwork != null) meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
                session.setMetadata(meta.build());
            } catch (Exception ignored) {
                // 元数据失败不影响播放
            }
        }
        loadArtwork();
        updateNotification();
    }

    /* -------------------------------------------------------- 通知栏 */

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (notificationManager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "正在播放", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("后台播放时的媒体控制");
        channel.setShowBadge(false);
        channel.setSound(null, null);
        notificationManager.createNotificationChannel(channel);
    }

    /** 保证服务处于前台（带通知）。 */
    private void ensureForeground() {
        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, notification);
            }
        } catch (Exception e) {
            Log.w(TAG, "startForeground 失败：" + e.getMessage());
        }
    }

    private void updateNotification() {
        if (notificationManager == null) return;
        try {
            notificationManager.notify(NOTIF_ID, buildNotification());
        } catch (Exception ignored) {
            // 通知失败不影响播放
        }
    }

    private Notification buildNotification() {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b = new Notification.Builder(this, CHANNEL_ID);
        } else {
            b = new Notification.Builder(this);
        }
        b.setContentTitle(title.isEmpty() ? "正在播放" : title)
                .setContentText(artist)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(openAppIntent())
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (artwork != null) {
            b.setLargeIcon(artwork);
            b.setStyle(new Notification.BigPictureStyle().bigPicture(artwork));
        }
        b.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_previous, "上一首", commandIntent("prev")).build());
        b.addAction(new Notification.Action.Builder(
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "暂停" : "播放", commandIntent(playing ? "pause" : "play")).build());
        b.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_next, "下一首", commandIntent("next")).build());
        return b.build();
    }

    private PendingIntent openAppIntent() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, 0, intent, flags);
    }

    private PendingIntent commandIntent(String command) {
        Intent intent = new Intent(this, PlaybackService.class);
        intent.setAction(ACTION_COMMAND);
        intent.putExtra(EXTRA_COMMAND, command);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, command.hashCode(), intent, flags);
    }

    /* ---------------------------------------------------------- 封面 */

    /**
     * 拉封面（后台小线程）。
     * 拉不到就算了 —— 通知里没有图而已，不影响播放。
     */
    private void loadArtwork() {
        if (artwork != null || cover.isEmpty()) return;
        final String url = cover;
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                Bitmap bitmap = null;
                HttpURLConnection conn = null;
                try {
                    conn = (HttpURLConnection) new URL(withSize(url)).openConnection();
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    InputStream in = conn.getInputStream();
                    byte[] data = readAll(in);
                    BitmapFactory.Options opts = new BitmapFactory.Options();
                    opts.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(data, 0, data.length, opts);
                    int sample = 1;
                    while (opts.outWidth / sample > 320) sample *= 2;
                    BitmapFactory.Options opts2 = new BitmapFactory.Options();
                    opts2.inSampleSize = sample;
                    bitmap = BitmapFactory.decodeByteArray(data, 0, data.length, opts2);
                } catch (Exception e) {
                    Log.w(TAG, "封面拉取失败：" + e.getMessage());
                } finally {
                    if (conn != null) conn.disconnect();
                }
                if (bitmap != null) {
                    artwork = bitmap;
                    updateNotification();
                }
            }
        }, "KumoneArt");
        t.start();
    }

    private static String withSize(String url) {
        if (url.indexOf("param=") >= 0) return url;
        return url + (url.indexOf('?') >= 0 ? "&" : "?") + "param=300y300";
    }

    private static byte[] readAll(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        in.close();
        return bos.toByteArray();
    }
}
