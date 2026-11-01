package com.kumone.music;

import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 播放状态的原生出口。
 *
 * 界面层（core/player.js）把「现在在放什么、放没放」告诉这里，
 * 这里负责：
 *   1. 让后台播放服务活着（前台服务 → 系统不随手回收进程）
 *   2. 把状态发布到系统媒体会话（锁屏 / 通知栏 / 耳机按键）
 *
 * 反方向：系统媒体键与通知栏按钮 → dispatch() → 回到界面层的播放引擎。
 * 回程走 bridge.eval（只有两参版本），不引入新的桥接机制。
 */
@CapacitorPlugin(name = "KumoneMedia")
public class MediaPlugin extends Plugin {

    private static volatile MediaPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /**
     * 开始播放 / 换歌 / 播放状态变化时调用。
     * @param call { title, artist, album, cover, playing, position, duration }
     */
    @PluginMethod
    public void publish(PluginCall call) {
        try {
            JSObject data = call.getData();
            Bundle bundle = new Bundle();
            bundle.putString("title", data.getString("title", ""));
            bundle.putString("artist", data.getString("artist", ""));
            bundle.putString("album", data.getString("album", ""));
            bundle.putString("cover", data.getString("cover", ""));
            bundle.putBoolean("playing", Boolean.TRUE.equals(data.getBoolean("playing")));
            bundle.putLong("position", (long) data.optDouble("position", 0d));
            bundle.putLong("duration", (long) data.optDouble("duration", 0d));
            PlaybackService.publish(getContext(), bundle);
        } catch (Exception e) {
            // 原生层出问题也不能影响播放
        }
        call.resolve();
    }

    /** 完全不播了：把前台服务收掉。 */
    @PluginMethod
    public void stop(PluginCall call) {
        try {
            PlaybackService.shutdown(getContext());
        } catch (Exception ignored) {
            // 收不掉也没关系
        }
        call.resolve();
    }

    /**
     * 系统媒体键 / 通知栏按钮 → 界面层的播放引擎。
     * @param command play | pause | next | prev | seek:秒
     */
    public static void dispatch(String command) {
        MediaPlugin plugin = instance;
        if (plugin == null || plugin.getBridge() == null) return;
        String js;
        String cmd = command == null ? "" : command;
        if ("play".equals(cmd)) {
            js = "try{window.Mobile&&window.Mobile.player&&window.Mobile.player.play()}catch(e){}";
        } else if ("pause".equals(cmd)) {
            js = "try{window.Mobile&&window.Mobile.player&&window.Mobile.player.pause()}catch(e){}";
        } else if ("next".equals(cmd)) {
            js = "try{window.Mobile&&window.Mobile.player&&window.Mobile.player.next(true)}catch(e){}";
        } else if ("prev".equals(cmd)) {
            js = "try{window.Mobile&&window.Mobile.player&&window.Mobile.player.prev()}catch(e){}";
        } else if (cmd.startsWith("seek:")) {
            String seconds = cmd.substring(5);
            js = "try{window.Mobile&&window.Mobile.player&&window.Mobile.player.seek(" + seconds + ")}catch(e){}";
        } else {
            return;
        }
        try {
            plugin.getBridge().eval(js, null);
        } catch (Exception ignored) {
            // 回程失败也不该崩
        }
    }
}
