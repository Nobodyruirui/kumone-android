package com.kumone.music;

import android.os.Build;
import android.os.Bundle;

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
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HTTPClientPlugin.class);
        registerPlugin(BackPlugin.class);
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    dispatchBackToWeb();
                }
            });
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
