package com.kalpak.reader;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int REQ_FILE = 41;
    private static final int MAX_BYTES = 60 * 1024 * 1024;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private TextToSpeech tts;
    private VoiceEngine voice;
    private volatile String ttsStatus = "init";
    private final Object pendingLock = new Object();
    private String pendingFile = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, "নথি বেছে নিন"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "KalpakNative");

        voice = new VoiceEngine(getFilesDir(), (channel, kind, arg) ->
                js("window." + channel + " && window." + channel + "('" + kind + "','" + safeId(arg) + "')"));

        readIntent(getIntent());
        initTts();
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readIntent(intent);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) {
            return;
        }
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            result = new Uri[]{data.getData()};
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.kalpakBack && window.kalpakBack()) ? '1' : '0'", value -> {
            if (value == null || !value.contains("1")) {
                finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (voice != null) {
            voice.shutdown();
        }
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }

    private void js(final String code) {
        runOnUiThread(() -> web.evaluateJavascript(code, null));
    }

    /* অন্য অ্যাপ থেকে "এটা দিয়ে খুলুন" করলে ফাইলটা পড়ে রাখা */
    private void readIntent(final Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) {
            return;
        }
        final Uri uri = intent.getData();
        new Thread(() -> {
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                if (in == null) {
                    return;
                }
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    if (out.size() > MAX_BYTES) {
                        return;
                    }
                }
                JSONObject o = new JSONObject();
                o.put("name", displayName(uri));
                o.put("b64", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                synchronized (pendingLock) {
                    pendingFile = o.toString();
                }
                js("window.kalpakIncoming && window.kalpakIncoming()");
            } catch (Exception ignored) {
                /* ফাইল পড়া না গেলে অ্যাপ সাধারণভাবেই খুলবে */
            }
        }).start();
    }

    private String displayName(Uri uri) {
        String name = null;
        try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    name = c.getString(idx);
                }
            }
        } catch (Exception ignored) {
            /* নাম না পেলে নিচের বিকল্প */
        }
        if (name == null || name.isEmpty()) {
            name = uri.getLastPathSegment();
        }
        return name == null ? "নথি" : name;
    }

    private void initTts() {
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) {
                ttsStatus = "none";
            } else {
                int r = tts.setLanguage(new Locale("bn", "IN"));
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                    r = tts.setLanguage(new Locale("bn"));
                }
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                    ttsStatus = "nolang";
                } else {
                    ttsStatus = "ready";
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {
                        }

                        @Override
                        public void onDone(String utteranceId) {
                            js("window.kalpakTts && window.kalpakTts('done','" + safeId(utteranceId) + "')");
                        }

                        @Override
                        public void onError(String utteranceId) {
                            js("window.kalpakTts && window.kalpakTts('error','" + safeId(utteranceId) + "')");
                        }
                    });
                }
            }
            js("window.kalpakTts && window.kalpakTts('status','" + ttsStatus + "')");
        });
    }

    private static String safeId(String id) {
        return id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", "");
    }

    private File bookFile(String id) {
        File dir = new File(getFilesDir(), "books");
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return new File(dir, safeId(id) + ".json");
    }

    private class Bridge {

        @JavascriptInterface
        public void saveBook(String id, String json) {
            try (FileOutputStream out = new FileOutputStream(bookFile(id))) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
            } catch (Exception ignored) {
                /* লেখা না গেলে পরের বার ফাইলটা আবার খুলতে হবে */
            }
        }

        @JavascriptInterface
        public String loadBook(String id) {
            File f = bookFile(id);
            if (!f.exists()) {
                return "";
            }
            try (FileInputStream in = new FileInputStream(f)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                }
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void deleteBook(String id) {
            File f = bookFile(id);
            if (f.exists()) {
                f.delete();
            }
        }

        @JavascriptInterface
        public String takePendingFile() {
            synchronized (pendingLock) {
                String p = pendingFile;
                pendingFile = "";
                return p;
            }
        }

        @JavascriptInterface
        public String ttsStatus() {
            return ttsStatus;
        }

        @JavascriptInterface
        public void speak(String text, String utteranceId) {
            if (tts != null && "ready".equals(ttsStatus)) {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, safeId(utteranceId));
            } else {
                js("window.kalpakTts && window.kalpakTts('error','" + safeId(utteranceId) + "')");
            }
        }

        @JavascriptInterface
        public void stopSpeak() {
            if (tts != null) {
                tts.stop();
            }
        }

        @JavascriptInterface
        public void setRate(double rate) {
            if (tts != null) {
                tts.setSpeechRate((float) Math.max(0.4, Math.min(2.5, rate)));
            }
        }

        @JavascriptInterface
        public String voiceStatus() {
            return voice.status();
        }

        @JavascriptInterface
        public void voiceDownload() {
            voice.download();
        }

        @JavascriptInterface
        public void voiceDelete() {
            voice.delete();
        }

        @JavascriptInterface
        public void voiceSpeak(String text, String utteranceId, int speaker, double rate, String next) {
            voice.speak(text, safeId(utteranceId), speaker, rate, next);
        }

        @JavascriptInterface
        public void voiceStop() {
            voice.stop();
        }

        @JavascriptInterface
        public void keepAwake(final boolean on) {
            runOnUiThread(() -> {
                if (on) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void openTtsSettings() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent("com.android.settings.TTS_SETTINGS");
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch (Exception ignored) {
                    /* কিছু ফোনে এই পর্দা নেই */
                }
            });
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }
}
