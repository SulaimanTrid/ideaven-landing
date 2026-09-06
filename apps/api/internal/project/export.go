package project

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"ideaven/apps/api/internal/httpx"
)

// Exports (roadmap 26/30–31): the model is interpreted by a self-contained
// vanilla-JS runtime inlined into one HTML file. That file is the standalone
// web export AND the asset an Android WebView project loads — one runtime,
// two targets. The exported app runs the same block IR as the editor's
// Preview, so what the owner tested is what visitors and the APK get.

var slugSafe = regexp.MustCompile(`[^a-z0-9]+`)

func exportFilename(slug, suffix string) string {
	clean := strings.Trim(slugSafe.ReplaceAllString(strings.ToLower(slug), "-"), "-")
	if clean == "" {
		clean = "project"
	}
	return clean + suffix
}

func androidPackage(slug string) string {
	clean := slugSafe.ReplaceAllString(strings.ToLower(slug), "")
	if clean == "" {
		clean = "project"
	}
	if len(clean) > 24 {
		clean = clean[:24]
	}
	return "dev.ideaven.export." + clean
}

// ExportHTML writes the standalone single-file web export.
func (h *Handler) ExportHTML(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	project, err := h.service.Get(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	html, err := StandaloneHTML(project.Name, project.Model, requestBase(r))
	if err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal, "Could not build the export. Try again shortly."))
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", exportFilename(project.Slug, ".html")))
	_, _ = w.Write(html)
}

// ExportAndroid writes a ready-to-build Android WebView project (zip):
// open it in Android Studio or let the included GitHub Actions workflow
// build the APK — no local SDK required for that path.
func (h *Handler) ExportAndroid(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	project, err := h.service.Get(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	// No asset base for the WebView build: a phone cannot reach this server's
	// local API, so stored images render as the honest placeholder.
	html, err := StandaloneHTML(project.Name, project.Model, "")
	if err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal, "Could not build the export. Try again shortly."))
		return
	}

	var buf bytes.Buffer
	zipName := exportFilename(project.Slug, "-android.zip")
	if err := writeAndroidProject(&buf, project.Name, project.Slug, html); err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal, "Could not build the Android project. Try again shortly."))
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", zipName))
	_, _ = w.Write(buf.Bytes())
}

// StandaloneHTML inlines the model document and the vanilla runtime into one
// HTML document.
// requestBase derives the API origin the export should use for its own
// stored assets (the project must stay published for them to resolve).
func requestBase(r *http.Request) string {
	if r.TLS != nil {
		return "https://" + r.Host
	}
	return "http://" + r.Host
}

func StandaloneHTML(name string, modelJSON []byte, assetBase string) ([]byte, error) {
	// "</" inside the JSON could close the script tag early; escape it.
	safeModel := bytes.ReplaceAll(modelJSON, []byte("</"), []byte(`<\/`))

	page := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s — Ideaven export</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%%; background: #0a0c12; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { display: flex; flex-direction: column; align-items: center; }
  #stage { width: 390px; max-width: 100vw; height: 844px; max-height: 100vh; background: #fff;
           overflow: hidden; position: relative; border-radius: 24px; margin: 16px 0; }
  @media (max-width: 420px) { #stage { margin: 0; border-radius: 0; height: 100vh; } }
  #toast { position: absolute; left: 16px; right: 16px; bottom: 20px; background: rgb(14 17 25 / .92);
           color: #fff; padding: 12px 16px; border-radius: 12px; font-size: 13px; display: none; }
  input, button { font: inherit; }
</style>
</head>
<body>
<div id="stage"><div id="root" style="display:flex;flex-direction:column;min-height:100%%;width:100%%"></div></div>
<div id="toast" role="status"></div>
<script type="application/json" id="ideaven-model">%s</script>
<script>
(function () {
  "use strict";
  var model = JSON.parse(document.getElementById("ideaven-model").textContent);
  var ASSET_BASE = %q;

  // ---- state -----------------------------------------------------------------
  var variables = {};
  (model.variables || []).forEach(function (v) {
    variables[v.name] = v.type === "number" ? 0 : v.type === "boolean" ? false : "";
  });
  var componentProps = {};
  var currentScreenId = model.navigation.startScreenId || (model.screens[0] && model.screens[0].id);
  var toastTimer = null;

  model.screens.forEach(function (s) { seedProps(s.components); });
  function seedProps(nodes) {
    (nodes || []).forEach(function (n) {
      componentProps[n.id] = Object.assign({}, n.props || {});
      seedProps(n.children);
    });
  }

  // ---- styles ----------------------------------------------------------------
  function px(v, fallback) {
    if (typeof v === "number") return v + "px";
    if (typeof v === "string" && v.trim() !== "") return v;
    return fallback || undefined;
  }
  function flexValue(v) {
    return { start: "flex-start", end: "flex-end", between: "space-between", center: "center", stretch: "stretch" }[v];
  }
  function styleCSS(styles) {
    var s = styles || {}, css = {};
    if (typeof s.background === "string") css.background = s.background;
    if (typeof s.color === "string") css.color = s.color;
    var fs = px(s.fontSize); if (fs) css["font-size"] = fs;
    if (s.fontWeight != null) css["font-weight"] = s.fontWeight;
    if (typeof s.textAlign === "string") css["text-align"] = s.textAlign;
    var p = px(s.padding); if (p) css.padding = p;
    var r = px(s.radius); if (r) css["border-radius"] = r;
    if (typeof s.borderWidth === "number" && s.borderWidth > 0) {
      css.border = s.borderWidth + "px solid " + (typeof s.borderColor === "string" ? s.borderColor : "#d5d9e2");
    }
    var g = px(s.gap); if (g) css.gap = g;
    var a = flexValue(s.align); if (a) css["align-items"] = a;
    var j = flexValue(s.justify); if (j) css["justify-content"] = j;
    var w = px(s.width); if (w) css.width = w;
    var h = px(s.height); if (h) css.height = h;
    if (s.fit === "contain" || s.fit === "cover") css["object-fit"] = s.fit;
    var m = px(s.margin); if (m) css.margin = m;
    if (s.grow === true) css["flex-grow"] = 1;
    return css;
  }
  function applyCSS(el, styles) {
    var css = styleCSS(styles);
    for (var key in css) el.style[key] = css[key];
  }

  // ---- block evaluation ------------------------------------------------------
  function evalBlock(b) {
    switch (b.type) {
      case "text": return String((b.inputs && b.inputs.value) != null ? b.inputs.value : "");
      case "number": return Number(b.inputs && b.inputs.value) || 0;
      case "get-variable": return variables[b.inputs.name];
      case "get-property": {
        var props = componentProps[b.inputs.componentId];
        return props ? props[b.inputs.property] : undefined;
      }
      case "join": return String(evalBlock(b.slots.a)) + String(evalBlock(b.slots.b));
      case "equals": return evalBlock(b.slots.a) === evalBlock(b.slots.b);
      default: return undefined;
    }
  }

  function runBody(blocks) {
    (blocks || []).forEach(function (b) {
      switch (b.type) {
        case "set-property": {
          var props = componentProps[b.inputs.componentId];
          if (props) props[b.inputs.property] = evalBlock(b.slots.value);
          break;
        }
        case "set-variable":
          variables[b.inputs.name] = evalBlock(b.slots.value);
          break;
        case "show-message":
          showToast(evalBlock(b.slots.message));
          break;
        case "navigate":
          if (model.screens.some(function (s) { return s.id === b.inputs.screenId; })) {
            currentScreenId = b.inputs.screenId;
          }
          break;
        case "if":
          if (evalBlock(b.slots.condition) === true) runBody(b.children);
          else runBody(b.elseChildren);
          break;
      }
    });
  }

  function showToast(text) {
    var el = document.getElementById("toast");
    el.textContent = String(text == null ? "" : text);
    el.style.display = "block";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.display = "none"; }, 2600);
  }

  // ---- rendering ---------------------------------------------------------------
  function renderNode(node) {
    var props = componentProps[node.id] || {};
    var styles = node.styles || {};
    var el, child;

    function container(flexDirection) {
      var d = document.createElement("div");
      applyCSS(d, styles);
      d.style.display = "flex";
      d.style.flexDirection = flexDirection;
      d.style.minWidth = "0";
      if (node.type === "card") d.style.boxShadow = "0 1px 3px rgb(16 24 40 / .08)";
      (node.children || []).forEach(function (c) { d.appendChild(renderNode(c)); });
      return d;
    }

    switch (node.type) {
      case "column":
      case "container":
      case "card": return container("column");
      case "row": return container("row");
      case "text": {
        el = document.createElement("div");
        applyCSS(el, styles);
        el.style.whiteSpace = "pre-wrap";
        el.textContent = String(props.text == null ? "" : props.text);
        return el;
      }
      case "button": {
        el = document.createElement("button");
        applyCSS(el, styles);
        el.style.display = "inline-flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.alignSelf = "flex-start";
        el.style.border = "none";
        el.style.cursor = "pointer";
        el.textContent = String(props.label == null ? "" : props.label);
        wire(el, node.id, "click");
        return el;
      }
      case "icon": {
        el = document.createElement("span");
        applyCSS(el, styles);
        el.style.display = "inline-flex";
        el.style.alignSelf = "flex-start";
        el.textContent = "?";
        return el;
      }
      case "image": {
        var src = String(props.src || "");
        if (src.indexOf("asset:") === 0 && ASSET_BASE) {
          src = ASSET_BASE + "/api/assets/" + encodeURIComponent(src.slice(6)) + "/raw";
        }
        if (src.indexOf("asset:") === 0) {
          el = document.createElement("div");
          applyCSS(el, styles);
          el.style.width = px(styles.width, "200px");
          el.style.height = px(styles.height, "140px");
          el.style.display = "flex";
          el.style.alignItems = "center";
          el.style.justifyContent = "center";
          el.style.background = "#f0f1f5";
          el.style.border = "1px dashed #c9cede";
          el.style.color = "#8a91a3";
          el.style.fontSize = "13px";
          el.textContent = "Image — set a URL";
          return el;
        }
        el = document.createElement("img");
        applyCSS(el, styles);
        el.style.width = px(styles.width, "200px");
        el.style.height = px(styles.height, "140px");
        el.style.background = "#f0f1f5";
        el.src = src;
        el.alt = String(props.alt || "");
        return el;
      }
      case "text-input":
      case "password-input": {
        el = document.createElement("input");
        el.type = node.type === "password-input" ? "password" : "text";
        applyCSS(el, styles);
        el.style.alignSelf = "stretch";
        el.value = String(props.value == null ? "" : props.value);
        el.placeholder = String(props.placeholder || "");
        el.addEventListener("input", function () { componentProps[node.id].value = el.value; });
        el.addEventListener("change", function () { emit(node.id, "change"); });
        el.addEventListener("keydown", function (e) { if (e.key === "Enter") { emit(node.id, "enter"); } });
        return el;
      }
      case "checkbox": {
        el = document.createElement("label");
        applyCSS(el, styles);
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.gap = "8px";
        child = document.createElement("input");
        child.type = "checkbox";
        child.checked = props.checked === true;
        child.style.width = "16px"; child.style.height = "16px";
        child.addEventListener("change", function () {
          componentProps[node.id].checked = child.checked;
          emit(node.id, "change");
        });
        var label = document.createElement("span");
        label.textContent = String(props.label || "");
        label.style.fontSize = px(styles.fontSize, "15px");
        el.appendChild(child); el.appendChild(label);
        return el;
      }
      case "switch": {
        el = document.createElement("button");
        applyCSS(el, styles);
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.gap = "8px";
        el.style.background = "transparent";
        el.style.border = "none";
        el.style.padding = "0";
        el.style.cursor = "pointer";
        var on = props.on === true;
        var active = typeof styles.color === "string" ? styles.color : "#5743d9";
        var track = document.createElement("span");
        track.style.cssText = "width:40px;height:22px;border-radius:11px;position:relative;background:" + (on ? active : "#c9cede");
        var knob = document.createElement("span");
        knob.style.cssText = "position:absolute;top:2px;left:" + (on ? "20px" : "2px") + ";width:18px;height:18px;border-radius:9px;background:#fff;box-shadow:0 1px 2px rgb(16 24 40 / .25)";
        track.appendChild(knob);
        var switchLabel = document.createElement("span");
        switchLabel.textContent = String(props.label || "");
        switchLabel.style.fontSize = px(styles.fontSize, "15px");
        switchLabel.style.color = "#0b0e16";
        el.appendChild(track); el.appendChild(switchLabel);
        el.addEventListener("click", function () {
          componentProps[node.id].on = !(componentProps[node.id].on === true);
          emit(node.id, "change");
        });
        return el;
      }
      case "divider": {
        el = document.createElement("div");
        applyCSS(el, styles);
        el.style.height = typeof styles.thickness === "number" ? styles.thickness + "px" : "1px";
        el.style.background = typeof styles.color === "string" ? styles.color : "#e3e6ee";
        el.style.alignSelf = "stretch";
        return el;
      }
      case "spacer": {
        el = document.createElement("div");
        applyCSS(el, styles);
        return el;
      }
      default: {
        el = document.createElement("div");
        el.style.cssText = "color:#8a91a3;font-size:13px;padding:12px";
        el.textContent = "Unknown \u201C" + node.type + "\u201D";
        return el;
      }
    }
  }

  // ---- events ------------------------------------------------------------------
  function wire(el, componentId, event) {
    el.addEventListener(event, function () { emit(componentId, event); });
  }

  function emit(componentId, event) {
    var screen = screenOf(currentScreenId);
    if (!screen || !screen.logic) { rerender(); return; }
    var ran = false;
    screen.logic.handlers.forEach(function (h) {
      if (h.event === event && (h.componentId === componentId || (event === "click" && h.componentId === null && false))) {
        runBody(h.body); ran = true;
      }
    });
    void ran;
    rerender();
  }

  function screenOf(id) {
    return model.screens.find(function (s) { return s.id === id; });
  }

  function rerender() {
    var root = document.getElementById("root");
    var screen = screenOf(currentScreenId) || model.screens[0];
    root.innerHTML = "";
    var bg = screen && screen.styles && typeof screen.styles.background === "string" ? screen.styles.background : "#ffffff";
    root.style.background = bg;
    (screen ? screen.components : []).forEach(function (c) { root.appendChild(renderNode(c)); });
  }

  rerender();
})();
</script>
</body>
</html>
`, name, safeModel, assetBase)
	return []byte(page), nil
}

// writeAndroidProject assembles the zip: Gradle Kotlin WebView shell whose
// asset/index.html is the standalone export. The included GitHub Actions
// workflow builds a debug APK without any local Android SDK.
func writeAndroidProject(buf *bytes.Buffer, name, slug string, html []byte) error {
	pkg := androidPackage(slug)
	projPath := "app/src/main"
	files := map[string][]byte{
		"settings.gradle.kts": []byte(`pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "ideaven-export"
include(":app")
`),
		"build.gradle.kts": []byte(`plugins { id("com.android.application") version "8.5.2" apply false; id("org.jetbrains.kotlin.android") version "2.0.0" apply false }
`),
		"gradle.properties": []byte("org.gradle.jvmargs=-Xmx2048m\nandroid.useAndroidX=true\n"),
		"app/build.gradle.kts": []byte(fmt.Sprintf(`plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

android {
    namespace = "%[1]s"
    compileSdk = 34
    defaultConfig {
        applicationId = "%[1]s"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    buildTypes { release { isMinifyEnabled = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies { implementation("androidx.appcompat:appcompat:1.7.0") }
`, pkg)),
		projPath + "/AndroidManifest.xml": []byte(fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="%s" android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity android:name=".MainActivity" android:exported="true" android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`, name)),
		projPath + "/java/" + strings.ReplaceAll(pkg, ".", "/") + "/MainActivity.kt": []byte(fmt.Sprintf(`package %s

import android.os.Bundle
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity

/** Ideaven export: the standalone runtime runs in a local WebView asset. */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        setContentView(webView)
        webView.loadUrl("file:///android_asset/index.html")
    }
}
`, pkg)),
		"app/src/main/assets/index.html": html,
		"app/src/main/res/values/styles.xml": []byte(`<?xml version="1.0" encoding="utf-8"?>
<resources></resources>
`),
		"README.md": []byte(fmt.Sprintf("# %s — Ideaven Android export\n\nThe app runs from `app/src/main/assets/index.html` (the same standalone file as the web export) inside a WebView.\n\n## Build the APK\n\n**Without a local SDK:** push this folder to a GitHub repository — the included workflow (`.github/workflows/build-apk.yml`) builds `app-debug.apk` on every push and uploads it as an artifact.\n\n**With Android Studio:** open this folder and Run.\n\n**Command line (SDK installed):** `gradle assembleDebug` — output at `app/build/outputs/apk/debug/`.\n", name)),
		".github/workflows/build-apk.yml": []byte(`name: build-apk
on: [push]
jobs:
  apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: "17" }
      - uses: gradle/actions/setup-gradle@v3
      - run: gradle assembleDebug
      - uses: actions/upload-artifact@v4
        with:
          name: app-debug
          path: app/build/outputs/apk/debug/app-debug.apk
`),
	}

	zw := zip.NewWriter(buf)
	names := []string{}
	for fileName := range files {
		names = append(names, fileName)
	}
	sortStrings(names)
	for _, fileName := range names {
		w, err := zw.Create(fileName)
		if err != nil {
			return err
		}
		if _, err := w.Write(files[fileName]); err != nil {
			return err
		}
	}
	return zw.Close()
}

func sortStrings(items []string) {
	for i := 1; i < len(items); i++ {
		for j := i; j > 0 && items[j] < items[j-1]; j-- {
			items[j], items[j-1] = items[j-1], items[j]
		}
	}
}

var _ = context.Background
