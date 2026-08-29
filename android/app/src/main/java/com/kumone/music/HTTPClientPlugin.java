package com.kumone.music;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Native HTTP bridge. Runs requests on Android's OkHttp-less HttpURLConnection so the
 * WebView can call the NetEase API cross-origin (CORS does not apply to the native layer).
 * Exposed to the web layer as window.Capacitor.Plugins.HTTPClient.post({...}).
 */
@CapacitorPlugin(name = "HTTPClient")
public class HTTPClientPlugin extends Plugin {

    @PluginMethod
    public void post(final PluginCall call) {
        final String url = call.getString("url");
        final JSObject headers = call.getObject("headers") != null
                ? call.getObject("headers") : new JSObject();
        final String data = call.getString("data", "");

        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(15000);
                    conn.setDoOutput(true);
                    conn.setUseCaches(false);

                    Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        String v = headers.optString(k, null);
                        if (v != null) conn.setRequestProperty(k, v);
                    }
                    if (conn.getRequestProperty("Content-Type") == null) {
                        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                    }

                    OutputStream os = conn.getOutputStream();
                    os.write(data.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                    os.close();

                    int status = conn.getResponseCode();
                    InputStream is = (status >= 400) ? conn.getErrorStream() : conn.getInputStream();
                    final String body = readAll(is);

                    final JSObject respHeaders = new JSObject();
                    for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
                        if (e.getKey() == null) continue;
                        respHeaders.put(e.getKey(), String.join("; ", e.getValue()));
                    }

                    final JSObject ret = new JSObject();
                    ret.put("status", status);
                    ret.put("data", body);
                    ret.put("headers", respHeaders);

                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() { call.resolve(ret); }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() { call.reject("HTTP error: " + e.getMessage()); }
                    });
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        }, "KumoneHTTP");
        worker.start();
    }

    private static String readAll(InputStream in) throws Exception {
        if (in == null) in = new ByteArrayInputStream(new byte[0]);
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line).append('\n');
        r.close();
        return sb.toString();
    }
}