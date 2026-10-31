package com.kumone.music;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * App 控制插件：目前只有「退出 App」。
 *
 * 为什么需要它：
 *   Android 的返回键（硬件键 / 系统边缘返回手势）要交给界面层决定 ——
 *   有返回历史就回上一页，没有才退出。界面层判断完，需要一个「真的关掉」的口子，
 *   这个口子就是本插件的 exit()。
 *
 * 暴露给 web 层：window.Capacitor.Plugins.Back.exit()
 */
@CapacitorPlugin(name = "Back")
public class BackPlugin extends Plugin {

    @PluginMethod
    public void exit(final PluginCall call) {
        final android.app.Activity activity = getActivity();
        if (activity == null) {
            call.reject("没有可退出的 Activity");
            return;
        }
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.finish();
            }
        });
        call.resolve();
    }
}
