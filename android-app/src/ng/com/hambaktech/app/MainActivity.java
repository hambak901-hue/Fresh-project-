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
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
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
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity {

    private static final String START_URL = "https://hambaktech.com.ng";
    private static final String VERSION_CHECK_URL = "https://hambaktech.com.ng/api/app/version";
    private static final String OFFLINE_ASSET_URL = "file:///android_asset/offline.html";
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int STORAGE_PERMISSION_REQUEST_CODE = 1002;
    private static final int MAX_BASE64_DECODED_BYTES = 20 * 1024 * 1024; // 20MB safety cap

    private static final Set<String> ALLOWED_SAVE_MIMES = new HashSet<String>(Arrays.asList(
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/webp",
            "text/csv",
            "text/plain"
    ));

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri pendingCameraPhotoUri;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean hasShownUpdateDialog = false;

    // Pending download state for runtime WRITE_EXTERNAL_STORAGE permission on Android 7-9
    private String pendingHttpDownloadUrl;
    private String pendingHttpUserAgent;
    private String pendingHttpContentDisposition;
    private String pendingHttpMimeType;
    private String pendingB64Data;
    private String pendingB64Mime;
    private String pendingB64Name;

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
            if (isTrustedFirstPartyUrl(candidate)) {
                target = candidate;
            }
        }
        if (target != null) {
            webView.loadUrl(target);
        } else if (loadDefaultIfEmpty) {
            webView.loadUrl(START_URL);
        }
    }

    private boolean isTrustedFirstPartyUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(rawUrl);
            String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.US) : "";
            String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.US) : "";
            return "https".equals(scheme) && ("hambaktech.com.ng".equals(host) || "www.hambaktech.com.ng".equals(host));
        } catch (Exception e) {
            return false;
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        // Security hardening: disallow local file URI access from web content
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
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
                if (isTrustedFirstPartyUrl(url)) {
                    injectDownloadAndPrintBridgeScript(view);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame() && error != null) {
                    int code = error.getErrorCode();
                    if (isGenuineNetworkError(code)) {
                        view.loadUrl(OFFLINE_ASSET_URL);
                    }
                }
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (failingUrl != null && failingUrl.equals(view.getUrl()) && isGenuineNetworkError(errorCode)) {
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
                clearPendingCameraUri();
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

                List<Intent> extraIntents = new ArrayList<Intent>();
                boolean acceptsImage = acceptsImageCapture(fileChooserParams);
                if (acceptsImage && checkSelfPermissionSafe(Manifest.permission.CAMERA)) {
                    Intent camIntent = createSafeCameraIntent();
                    if (camIntent != null) {
                        extraIntents.add(camIntent);
                    }
                }

                Intent chooser = Intent.createChooser(contentIntent, "Select file or take photo");
                if (!extraIntents.isEmpty()) {
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extraIntents.toArray(new Intent[0]));
                }

                try {
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST_CODE);
                } catch (Exception ex) {
                    clearPendingCameraUri();
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

    private boolean isGenuineNetworkError(int errorCode) {
        return errorCode == WebViewClient.ERROR_HOST_LOOKUP
                || errorCode == WebViewClient.ERROR_CONNECT
                || errorCode == WebViewClient.ERROR_TIMEOUT
                || errorCode == WebViewClient.ERROR_IO
                || errorCode == WebViewClient.ERROR_PROXY_AUTHENTICATION
                || errorCode == WebViewClient.ERROR_UNKNOWN;
    }

    private boolean checkSelfPermissionSafe(String permission) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true;
        }
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean acceptsImageCapture(WebChromeClient.FileChooserParams params) {
        if (params == null) return false;
        String[] types = params.getAcceptTypes();
        if (types == null || types.length == 0) return true;
        for (String t : types) {
            if (t == null || t.trim().isEmpty()) continue;
            String lower = t.toLowerCase(Locale.US);
            if (lower.contains("image") || lower.contains("*/*") || lower.contains("jpg") || lower.contains("jpeg") || lower.contains("png")) {
                return true;
            }
        }
        return false;
    }

    private Intent createSafeCameraIntent() {
        try {
            Intent takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (takePictureIntent.resolveActivity(getPackageManager()) == null) {
                return null;
            }
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, "HAMBAK_CAPTURE_" + System.currentTimeMillis() + ".jpg");
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            Uri imageUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (imageUri == null) {
                return null;
            }
            pendingCameraPhotoUri = imageUri;
            takePictureIntent.putExtra(MediaStore.EXTRA_OUTPUT, imageUri);
            takePictureIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return takePictureIntent;
        } catch (Exception e) {
            clearPendingCameraUri();
            return null;
        }
    }

    private void clearPendingCameraUri() {
        if (pendingCameraPhotoUri != null) {
            try {
                getContentResolver().delete(pendingCameraPhotoUri, null, null);
            } catch (Exception ignored) {
            }
            pendingCameraPhotoUri = null;
        }
    }

    private boolean handleUriNavigation(WebView view, Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.US) : "";
        String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.US) : "";

        if ("https".equals(scheme)) {
            if (isTrustedInAppHost(host)) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                Toast.makeText(this, "Cannot open external link", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        if ("file".equals(scheme)) {
            return !uri.toString().equals(OFFLINE_ASSET_URL);
        }

        if ("http".equals(scheme) || "javascript".equals(scheme) || "data".equals(scheme)) {
            // Disallow cleartext HTTP & unsafe inline navigation in WebView
            return true;
        }

        if ("intent".equals(scheme)) {
            try {
                Intent parsed = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                if (parsed.resolveActivity(getPackageManager()) != null) {
                    startActivity(parsed);
                    return true;
                }
                String fallbackUrl = parsed.getStringExtra("browser_fallback_url");
                if (fallbackUrl != null && fallbackUrl.startsWith("https://")) {
                    view.loadUrl(fallbackUrl);
                    return true;
                }
            } catch (Exception ignored) {
            }
            return true;
        }

        if ("tel".equals(scheme) || "mailto".equals(scheme) || "whatsapp".equals(scheme) || "sms".equals(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                Toast.makeText(this, "No app found to handle link", Toast.LENGTH_SHORT).show();
            }
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

    private void injectDownloadAndPrintBridgeScript(WebView view) {
        String js = "(function(){"
                + "if(window.__hambakBridgeHooked) return;"
                + "window.__hambakBridgeHooked = true;"
                + "window.print = function(){"
                + "  try { window.HambakAndroidBridge.printPage(document.title || 'HAMBAKTECH Document'); } catch(e) {}"
                + "};"
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

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingHttpDownloadUrl = url;
            pendingHttpUserAgent = userAgent;
            pendingHttpContentDisposition = contentDisposition;
            pendingHttpMimeType = mimeType;
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, STORAGE_PERMISSION_REQUEST_CODE);
            return;
        }

        enqueueSystemDownload(url, userAgent, contentDisposition, mimeType);
    }

    private void enqueueSystemDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            request.setMimeType(mimeType);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) {
                request.addRequestHeader("Cookie", cookies);
            }
            if (userAgent != null) {
                request.addRequestHeader("User-Agent", userAgent);
            }
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
                    if (webView == null || !isTrustedFirstPartyUrl(webView.getUrl())) {
                        return;
                    }
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
                            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        pendingB64Data = base64Data;
                        pendingB64Mime = mimeType;
                        pendingB64Name = fileName;
                        requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, STORAGE_PERMISSION_REQUEST_CODE);
                        return;
                    }
                    writeBase64ToDownloads(base64Data, mimeType, fileName);
                }
            });
        }

        @JavascriptInterface
        public void printPage(final String jobName) {
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    if (webView == null || !isTrustedFirstPartyUrl(webView.getUrl())) {
                        return;
                    }
                    launchWebViewPrint(jobName);
                }
            });
        }

        @JavascriptInterface
        public void notifyError(final String msg) {
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    if (webView == null || !isTrustedFirstPartyUrl(webView.getUrl())) {
                        return;
                    }
                    if (msg != null && !msg.trim().isEmpty()) {
                        Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
                    }
                }
            });
        }
    }

    private void launchWebViewPrint(String rawJobName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP || webView == null) {
            Toast.makeText(this, "Printing requires Android 5.0+", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
            if (printManager == null) {
                Toast.makeText(this, "Print service unavailable on this device", Toast.LENGTH_SHORT).show();
                return;
            }
            String safeJobName = (rawJobName != null && !rawJobName.trim().isEmpty())
                    ? rawJobName.replaceAll("[^a-zA-Z0-9._ -]", "").trim()
                    : "HAMBAKTECH_Document";
            if (safeJobName.isEmpty()) {
                safeJobName = "HAMBAKTECH_Document";
            }
            PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(safeJobName);
            printManager.print(safeJobName, printAdapter, new PrintAttributes.Builder().build());
        } catch (Exception e) {
            Toast.makeText(this, "Unable to open print dialog: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void writeBase64ToDownloads(String base64Data, String mimeType, String rawName) {
        try {
            if (base64Data == null || base64Data.length() > (MAX_BASE64_DECODED_BYTES * 4L / 3L) + 1024) {
                Toast.makeText(this, "File too large to save.", Toast.LENGTH_LONG).show();
                return;
            }

            String safeMime = (mimeType != null && !mimeType.trim().isEmpty())
                    ? mimeType.toLowerCase(Locale.US).split(";")[0].trim()
                    : "application/pdf";
            if (!ALLOWED_SAVE_MIMES.contains(safeMime)) {
                Toast.makeText(this, "Blocked unsupported file type: " + safeMime, Toast.LENGTH_LONG).show();
                return;
            }

            byte[] decoded = Base64.decode(base64Data, Base64.DEFAULT);
            if (decoded == null || decoded.length == 0 || decoded.length > MAX_BASE64_DECODED_BYTES) {
                Toast.makeText(this, "Invalid or oversized file payload.", Toast.LENGTH_LONG).show();
                return;
            }

            String safeName = (rawName != null && !rawName.trim().isEmpty())
                    ? rawName.replaceAll("[^a-zA-Z0-9._-]", "_")
                    : "HAMBAKTECH_" + System.currentTimeMillis();

            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(safeMime);
            if (ext == null || ext.isEmpty()) {
                ext = safeMime.contains("pdf") ? "pdf" : "png";
            }
            if (!safeName.toLowerCase(Locale.US).endsWith("." + ext)) {
                safeName = safeName.replaceAll("\\.[^.]+$", "") + "." + ext;
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
            if (savedUri != null && "application/pdf".equals(safeMime)) {
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
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == STORAGE_PERMISSION_REQUEST_CODE) {
            boolean granted = grantResults != null && grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                if (pendingHttpDownloadUrl != null) {
                    String u = pendingHttpDownloadUrl;
                    String ua = pendingHttpUserAgent;
                    String cd = pendingHttpContentDisposition;
                    String mt = pendingHttpMimeType;
                    pendingHttpDownloadUrl = null;
                    enqueueSystemDownload(u, ua, cd, mt);
                }
                if (pendingB64Data != null) {
                    String b = pendingB64Data;
                    String m = pendingB64Mime;
                    String n = pendingB64Name;
                    pendingB64Data = null;
                    writeBase64ToDownloads(b, m, n);
                }
            } else {
                pendingHttpDownloadUrl = null;
                pendingB64Data = null;
                Toast.makeText(this, "Storage permission required to save downloads.", Toast.LENGTH_LONG).show();
            }
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (filePathCallback == null) {
                clearPendingCameraUri();
                super.onActivityResult(requestCode, resultCode, data);
                return;
            }
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK) {
                if (data != null && data.getClipData() != null) {
                    ClipData clip = data.getClipData();
                    List<Uri> uris = new ArrayList<Uri>();
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        uris.add(clip.getItemAt(i).getUri());
                    }
                    results = uris.toArray(new Uri[0]);
                    clearPendingCameraUri();
                } else if (data != null && data.getData() != null) {
                    results = new Uri[]{data.getData()};
                    clearPendingCameraUri();
                } else if (pendingCameraPhotoUri != null) {
                    results = new Uri[]{pendingCameraPhotoUri};
                    pendingCameraPhotoUri = null;
                }
            } else {
                clearPendingCameraUri();
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
            return 2;
        }
    }

    private String getCurrentVersionName() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionName != null ? info.versionName : "1.0.1";
        } catch (Exception e) {
            return "1.0.1";
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

                    final int remoteCode = androidObj.optInt("version_code", 2);
                    final String remoteName = androidObj.optString("version_name", "1.0.1");
                    final String downloadUrl = androidObj.optString("download_url", "");
                    final String notes = androidObj.optString("release_notes", "A new version of HAMBAKTECH is available.");
                    final boolean forceUpdate = androidObj.optBoolean("force_update", false);

                    if (remoteCode > getCurrentVersionCode() && !downloadUrl.isEmpty() && !hasShownUpdateDialog) {
                        hasShownUpdateDialog = true;
                        final String resolvedUrl = downloadUrl.startsWith("http")
                                ? downloadUrl
                                : START_URL + (downloadUrl.startsWith("/") ? "" : "/") + downloadUrl;
                        if (!resolvedUrl.startsWith("https://hambaktech.com.ng/")) {
                            return;
                        }
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
        clearPendingCameraUri();
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
