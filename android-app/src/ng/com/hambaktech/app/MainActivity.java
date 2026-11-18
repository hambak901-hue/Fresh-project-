package ng.com.hambaktech.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private static final String START_URL = "https://hambaktech.com.ng";
    private static final String VERSION_CHECK_URL = "https://hambaktech.com.ng/api/app/version";
    private static final String OFFLINE_ASSET_URL = "file:///android_asset/offline.html";
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int STORAGE_PERMISSION_REQUEST_CODE = 1002;

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean hasShownUpdateDialog = false;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#020617"));

        webView = new WebView(this);
        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
        root.addView(webView, webParams);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(false);
        progressBar.setMax(100);
        progressBar.setVisibility(View.GONE);
        FrameLayout.LayoutParams barParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                6,
                Gravity.TOP
        );
        root.addView(progressBar, barParams);

        setContentView(root);

        configureWebView();
        handleIntentUrl(getIntent(), true);
        checkAppUpdateInBackground();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntentUrl(intent, false);
    }

    private void handleIntentUrl(Intent intent, boolean loadDefaultIfEmpty) {
        String target = null;
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            String candidate = intent.getData().toString();
            if (candidate.startsWith("https://hambaktech.com.ng")) {
                target = candidate;
            }
        }
        if (target != null) {
            webView.loadUrl(target);
        } else if (loadDefaultIfEmpty) {
            webView.loadUrl(START_URL);
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        String defaultUa = settings.getUserAgentString();
        String appVersionName = getCurrentVersionName();
        settings.setUserAgentString(defaultUa + " HambakTechAndroidApp/" + appVersionName);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        webView.addJavascriptInterface(new AndroidDownloadBridge(), "HambakAndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return handleUriNavigation(view, uri);
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUriNavigation(view, Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && url.startsWith("https://hambaktech.com.ng")) {
                    injectDownloadCaptureScript(view);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    view.loadUrl(OFFLINE_ASSET_URL);
                }
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (failingUrl != null && failingUrl.equals(view.getUrl())) {
                    view.loadUrl(OFFLINE_ASSET_URL);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallbackParam,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallbackParam;

                Intent contentIntent;
                try {
                    contentIntent = fileChooserParams.createIntent();
                } catch (Exception e) {
                    contentIntent = new Intent(Intent.ACTION_GET_CONTENT);
                    contentIntent.addCategory(Intent.CATEGORY_OPENABLE);
                    contentIntent.setType("*/*");
                }
                if (fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    contentIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }

                Intent chooser = Intent.createChooser(contentIntent, "Select file or photo");
                try {
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST_CODE);
                } catch (Exception ex) {
                    MainActivity.this.filePathCallback = null;
                    Toast.makeText(MainActivity.this, "Unable to open file picker", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(
                    String url,
                    String userAgent,
                    String contentDisposition,
                    String mimeType,
                    long contentLength
            ) {
                handleDownload(url, userAgent, contentDisposition, mimeType);
            }
        });
    }

    private boolean handleUriNavigation(WebView view, Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
        String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";

        if ("https".equals(scheme)) {
            if (isTrustedInAppHost(host)) {
                return false;
            }
            // Open other HTTPS sites (like social links, external help) cleanly in external browser
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                Toast.makeText(this, "Cannot open external link", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        if ("file".equals(scheme) && uri.toString().equals(OFFLINE_ASSET_URL)) {
            return false;
        }

        // Handle tel:, mailto:, whatsapp:, intent:, etc.
        if ("intent".equals(scheme)) {
            try {
                Intent parsed = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                if (parsed.resolveActivity(getPackageManager()) != null) {
                    startActivity(parsed);
                    return true;
                }
                String fallbackUrl = parsed.getStringExtra("browser_fallback_url");
                if (fallbackUrl != null) {
                    view.loadUrl(fallbackUrl);
                    return true;
                }
            } catch (Exception ignored) {
            }
            return true;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception e) {
            Toast.makeText(this, "No app found to handle link", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private boolean isTrustedInAppHost(String host) {
        return host.equals("hambaktech.com.ng")
                || host.endsWith(".hambaktech.com.ng")
                || host.endsWith("paystack.co")
                || host.endsWith("paystack.com")
                || host.endsWith("flutterwave.com")
                || host.endsWith("ravepay.co")
                || host.endsWith("monnify.com");
    }

    private void injectDownloadCaptureScript(WebView view) {
        String js = "(function(){"
                + "if(window.__hambakDownloadHooked) return;"
                + "window.__hambakDownloadHooked = true;"
                + "document.addEventListener('click', function(ev){"
                + "  var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;"
                + "  if(!a) return;"
                + "  var href = a.getAttribute('href') || '';"
                + "  var dl = a.getAttribute('download');"
                + "  if(dl || href.indexOf('blob:') === 0 || href.indexOf('data:') === 0){"
                + "    window.__hambakPendingDownloadName = dl || '';"
                + "  }"
                + "}, true);"
                + "var origClick = HTMLAnchorElement.prototype.click;"
                + "HTMLAnchorElement.prototype.click = function(){"
                + "  try {"
                + "    var href = this.getAttribute('href') || '';"
                + "    var dl = this.getAttribute('download') || this.download || '';"
                + "    if(dl || href.indexOf('blob:') === 0 || href.indexOf('data:') === 0){"
                + "      window.__hambakPendingDownloadName = dl;"
                + "    }"
                + "  } catch(e) {}"
                + "  return origClick.apply(this, arguments);"
                + "};"
                + "})();";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            view.evaluateJavascript(js, null);
        }
    }

    private void handleDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        if (url == null) return;

        if (url.startsWith("data:") || url.startsWith("blob:")) {
            String fallbackName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            String script = "(function(){"
                    + "var url = " + JSONObject.quote(url) + ";"
                    + "var chosenName = (window.__hambakPendingDownloadName && String(window.__hambakPendingDownloadName).trim()) || " + JSONObject.quote(fallbackName) + ";"
                    + "window.__hambakPendingDownloadName = '';"
                    + "if(url.indexOf('data:') === 0){"
                    + "  var parts = url.split(',');"
                    + "  var meta = parts[0] || '';"
                    + "  var mimeMatch = meta.match(/data:([^;]+)/i);"
                    + "  var mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';"
                    + "  var b64 = parts[1] || '';"
                    + "  window.HambakAndroidBridge.saveBase64File(b64, mime, chosenName);"
                    + "  return;"
                    + "}"
                    + "fetch(url).then(function(r){ return r.blob(); }).then(function(blob){"
                    + "  var reader = new FileReader();"
                    + "  reader.onloadend = function(){"
                    + "    var res = String(reader.result || '');"
                    + "    var idx = res.indexOf(',');"
                    + "    var b64 = idx >= 0 ? res.slice(idx + 1) : res;"
                    + "    window.HambakAndroidBridge.saveBase64File(b64, blob.type || 'application/pdf', chosenName);"
                    + "  };"
                    + "  reader.readAsDataURL(blob);"
                    + "}).catch(function(err){"
                    + "  window.HambakAndroidBridge.notifyError('Download failed: ' + err);"
                    + "});"
                    + "})();";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                webView.evaluateJavascript(script, null);
            }
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                    checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, STORAGE_PERMISSION_REQUEST_CODE);
            }
        }

        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            request.setMimeType(mimeType);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) {
                request.addRequestHeader("Cookie", cookies);
            }
            request.addRequestHeader("User-Agent", userAgent);
            request.setTitle(fileName);
            request.setDescription("Downloading from HAMBAKTECH");
            request.allowScanningByMediaScanner();
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(request);
                Toast.makeText(this, "Downloading " + fileName, Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "Unable to start download: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    public class AndroidDownloadBridge {
        @JavascriptInterface
        public void saveBase64File(final String base64Data, final String mimeType, final String fileName) {
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    writeBase64ToDownloads(base64Data, mimeType, fileName);
                }
            });
        }

        @JavascriptInterface
        public void notifyError(final String msg) {
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    private void writeBase64ToDownloads(String base64Data, String mimeType, String rawName) {
        try {
            byte[] decoded = Base64.decode(base64Data, Base64.DEFAULT);
            String safeMime = (mimeType != null && !mimeType.trim().isEmpty()) ? mimeType : "application/octet-stream";
            String safeName = (rawName != null && !rawName.trim().isEmpty())
                    ? rawName.replaceAll("[^a-zA-Z0-9._-]", "_")
                    : "HAMBAKTECH_" + System.currentTimeMillis();

            if (!safeName.contains(".")) {
                String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(safeMime);
                if (ext == null || ext.isEmpty()) {
                    ext = safeMime.contains("pdf") ? "pdf" : "bin";
                }
                safeName = safeName + "." + ext;
            }

            Uri savedUri = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContentResolver();
                ContentValues values = new ContentValues();
                values.put("_display_name", safeName);
                values.put("mime_type", safeMime);
                values.put("relative_path", Environment.DIRECTORY_DOWNLOADS + "/HAMBAKTECH");
                Uri collection = Uri.parse("content://media/external/downloads");
                savedUri = resolver.insert(collection, values);
                if (savedUri != null) {
                    OutputStream os = resolver.openOutputStream(savedUri);
                    if (os != null) {
                        os.write(decoded);
                        os.flush();
                        os.close();
                    }
                }
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) {
                    dir.mkdirs();
                }
                File outFile = new File(dir, safeName);
                FileOutputStream fos = new FileOutputStream(outFile);
                fos.write(decoded);
                fos.flush();
                fos.close();
                MediaScannerConnection.scanFile(this, new String[]{outFile.getAbsolutePath()}, new String[]{safeMime}, null);
                savedUri = Uri.fromFile(outFile);
            }

            Toast.makeText(this, "Saved to Downloads: " + safeName, Toast.LENGTH_LONG).show();
            if (savedUri != null && safeMime.contains("pdf")) {
                try {
                    Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                    viewIntent.setDataAndType(savedUri, safeMime);
                    viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (viewIntent.resolveActivity(getPackageManager()) != null) {
                        startActivity(viewIntent);
                    }
                } catch (Exception ignored) {
                }
            }
        } catch (Exception e) {
            Toast.makeText(this, "Could not save file: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (filePathCallback == null) {
                super.onActivityResult(requestCode, resultCode, data);
                return;
            }
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    ClipData clip = data.getClipData();
                    List<Uri> uris = new ArrayList<Uri>();
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        uris.add(clip.getItemAt(i).getUri());
                    }
                    results = uris.toArray(new Uri[0]);
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private int getCurrentVersionCode() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return (int) info.getLongVersionCode();
            }
            return info.versionCode;
        } catch (Exception e) {
            return 1;
        }
    }

    private String getCurrentVersionName() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionName != null ? info.versionName : "1.0.0";
        } catch (Exception e) {
            return "1.0.0";
        }
    }

    private void checkAppUpdateInBackground() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(VERSION_CHECK_URL);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    int code = conn.getResponseCode();
                    if (code != 200) return;

                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();

                    JSONObject json = new JSONObject(sb.toString());
                    final JSONObject androidObj = json.optJSONObject("android");
                    if (androidObj == null) return;

                    final int remoteCode = androidObj.optInt("version_code", 1);
                    final String remoteName = androidObj.optString("version_name", "1.0.0");
                    final String downloadUrl = androidObj.optString("download_url", "");
                    final String notes = androidObj.optString("release_notes", "A new version of HAMBAKTECH is available.");
                    final boolean forceUpdate = androidObj.optBoolean("force_update", false);

                    if (remoteCode > getCurrentVersionCode() && !downloadUrl.isEmpty() && !hasShownUpdateDialog) {
                        hasShownUpdateDialog = true;
                        final String resolvedUrl = downloadUrl.startsWith("http")
                                ? downloadUrl
                                : START_URL + (downloadUrl.startsWith("/") ? "" : "/") + downloadUrl;
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                if (isFinishing()) return;
                                AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this);
                                builder.setTitle("Update Available (v" + remoteName + ")");
                                builder.setMessage(notes);
                                builder.setCancelable(!forceUpdate);
                                builder.setPositiveButton("Update Now", new DialogInterface.OnClickListener() {
                                    @Override
                                    public void onClick(DialogInterface dialog, int which) {
                                        try {
                                            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(resolvedUrl)));
                                        } catch (Exception e) {
                                            Toast.makeText(MainActivity.this, "Cannot open update link", Toast.LENGTH_SHORT).show();
                                        }
                                    }
                                });
                                if (!forceUpdate) {
                                    builder.setNegativeButton("Later", null);
                                }
                                builder.show();
                            }
                        });
                    }
                } catch (Exception ignored) {
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        }).start();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
