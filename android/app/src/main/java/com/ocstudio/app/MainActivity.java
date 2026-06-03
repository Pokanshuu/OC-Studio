package com.ocstudio.app;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 沉浸式：内容延伸到状态栏和导航栏（小白条）下方
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // 系统栏透明
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
        getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        // FLAG_TRANSLUCENT_NAVIGATION 在标准 Android 上已废弃且会导致现代 API 行为异常，
        // 但 MIUI / HyperOS 依赖此标志触发导航栏沉浸，所以仅在小米设备上启用
        if ("Xiaomi".equalsIgnoreCase(Build.MANUFACTURER)) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        }
    }
}
