package com.kumone.music;

import android.os.Build;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.Window;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

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

    private static final int SYSTEM_BAR_SURFACE = 0xFFE9E9EE;

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

    private void applySystemBars() {
        if (bridge == null) return;
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setBackgroundDrawable(new ColorDrawable(SYSTEM_BAR_SURFACE));
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? Color.TRANSPARENT : Color.BLACK);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(true);
        bars.setAppearanceLightNavigationBars(true);

        // 由一处原生容器为状态栏、刘海、导航栏和键盘统一腾出空间。
        View container = (View) bridge.getWebView().getParent();
        container.setBackgroundColor(SYSTEM_BAR_SURFACE);
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> {
            Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(container);
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
