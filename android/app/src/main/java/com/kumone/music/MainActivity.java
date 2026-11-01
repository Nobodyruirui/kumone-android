package com.kumone.music;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/**
 * 唯一的 Activity。
 *
 * 返回键的分工：
 *   · 有返回历史 → 交给界面层（window.Mobile.systemBack），
 *     这样顶栏箭头、边缘左滑、硬件返回键走的是同一条路、同一套动画。
 *   · 没有返回历史 → 界面层会回调 Back 插件把 App 关掉。
 *
 * 为什么两条都要写：
 *   Android 13+ 用 OnBackPressedDispatcher（预测性返回），
 *   Android 15 上 targetSdk 35 的应用默认走这条路，onBackPressed **不再被调用**；
 *   更老的系统只认 onBackPressed。
 */
public class MainActivity extends BridgeActivity {

    /** 画布色：与 CSS 里的 --canvas 一致（#f4f4f6）。 */
    private static final int CANVAS = 0xFFF4F4F6;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HTTPClientPlugin.class);
        registerPlugin(BackPlugin.class);
        registerPlugin(MediaPlugin.class);
        super.onCreate(savedInstanceState);
        applySystemBars();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    dispatchBackToWeb();
                }
            });
        }
    }

    /**
     * 系统栏：状态栏那一块要和画布同色，图标要是深色的。
     *
     * 真机报「状态栏是白色的，跟最顶上融在一起了」—— 两个原因叠在一起：
     *   1. Android 15 强制 edge-to-edge，Capacitor 给 WebView 加了系统栏边距，
     *      于是状态栏那条露出来的是**窗口背景**（启动图是白的）→ 一条白带。
     *   2. 启动主题的图标是浅色（白）→ 白底白图标，等于看不见。
     *
     * 修法：窗口背景改成画布色，状态栏图标改成深色。
     */
    private void applySystemBars() {
        Window w = getWindow();
        // API 31+ 的启动图是独立的窗口，所以窗口背景改成纯色不会影响启动画面
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(CANVAS));
        } else {
            w.setStatusBarColor(CANVAS);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = w.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
            }
        } else {
            int flags = w.getDecorView().getSystemUiVisibility();
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            w.getDecorView().setSystemUiVisibility(flags);
        }
    }

    @Override
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // 新系统由 OnBackPressedCallback 处理，这里不要重复处理
            super.onBackPressed();
            return;
        }
        dispatchBackToWeb();
    }

    /** 把返回键交给界面层决定：有历史就回上一页，没有就退出 App。 */
    private void dispatchBackToWeb() {
        if (bridge == null) {
            finish();
            return;
        }
        bridge.eval(
            "(function(){try{"
            + "if(window.Mobile&&window.Mobile.systemBack){window.Mobile.systemBack();}"
            + "else{location.href='about:blank';}"
            + "}catch(e){}})();",
            null
        );
    }
}
