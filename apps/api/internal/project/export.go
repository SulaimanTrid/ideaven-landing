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
// build an APK (assembleDebug) or an AAB (bundleDebug) — no local SDK
// required for the workflow path. ?format=aab switches the configured task.
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
	format := r.URL.Query().Get("format")
	if format != "apk" && format != "aab" {
		format = "apk"
	}

	// No asset base for the WebView build: a phone cannot reach this server's
	// local API, so stored images render as the honest placeholder.
	html, err := StandaloneHTML(project.Name, project.Model, "")
	if err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal, "Could not build the export. Try again shortly."))
		return
	}

	var buf bytes.Buffer
	zipName := exportFilename(project.Slug, "-android-"+format+".zip")
	if err := writeAndroidProject(&buf, project.Name, project.Slug, html, format); err != nil {
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
      case "boolean": return b.inputs && b.inputs.value === true;
      case "get-variable": return variables[b.inputs.name];
      case "get-property": {
        var props = componentProps[b.inputs.componentId];
        return props ? props[b.inputs.property] : undefined;
      }
      case "join": return String(evalBlock(b.slots.a)) + String(evalBlock(b.slots.b));
      case "equals": return evalBlock(b.slots.a) === evalBlock(b.slots.b);
      case "add": return Number(evalBlock(b.slots.a)) + Number(evalBlock(b.slots.b));
      case "tinydb-get":
        try { var tv = localStorage.getItem(TINYDB_PREFIX + (b.inputs.key || "")); return tv === null ? "" : JSON.parse(tv); } catch (e) { return ""; }
      case "clock-now": {
        var now = new Date();
        var p2 = function (n) { return String(n).length < 2 ? "0" + n : String(n); };
        return now.getFullYear() + "-" + p2(now.getMonth() + 1) + "-" + p2(now.getDate()) + " " + p2(now.getHours()) + ":" + p2(now.getMinutes()) + ":" + p2(now.getSeconds());
      }
      case "location-latitude":
      case "location-longitude": {
        var lid = firstComponentIdOf("location-sensor");
        var lp = lid ? componentProps[lid] : null;
        if (!lp) return 0;
        return b.type === "location-latitude" ? (lp.latitude || 0) : (lp.longitude || 0);
      }
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
        case "change-variable": {
          var current = Number(variables[b.inputs.name]) || 0;
          var delta = Number(evalBlock(b.slots.amount)) || 0;
          variables[b.inputs.name] = current + delta;
          break;
        }
        case "play-sound":
          playSound(String((b.inputs && b.inputs.sound) != null ? b.inputs.sound : ""));
          break;
        case "stop-sound":
          if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null; }
          break;
        case "tinydb-store":
          try { localStorage.setItem(TINYDB_PREFIX + (b.inputs.key || ""), JSON.stringify(evalBlock(b.slots.value))); } catch (e) { showToast("\u26A0 TinyDB could not write"); }
          break;
        case "notifier-alert":
          showToast(evalBlock(b.slots.message));
          break;
        case "web-get":
          fetch(String((b.inputs && b.inputs.url) || "")).then(function (r) { return r.text(); }).then(function (text) {
            componentProps[firstComponentIdOf("web")].response = String(text).slice(0, 20000);
            rerender();
          }).catch(function (err) {
            componentProps[firstComponentIdOf("web")].response = "Error: " + String(err).slice(0, 200);
            rerender();
          });
          break;
        case "location-request":
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function (pos) {
              componentProps[firstComponentIdOf("location-sensor")].latitude = Number(pos.coords.latitude.toFixed(6));
              componentProps[firstComponentIdOf("location-sensor")].longitude = Number(pos.coords.longitude.toFixed(6));
              componentProps[firstComponentIdOf("location-sensor")].available = true;
              emit(firstComponentIdOf("location-sensor"), "location");
            }, function (err) {
              showToast("\u26A0 Location unavailable \u2014 " + err.message);
            });
          } else {
            showToast("\u26A0 Location is not available in this browser");
          }
          break;
        case "tts-speak":
          if (window.speechSynthesis) {
            var u = new SpeechSynthesisUtterance(String(evalBlock(b.slots.message) || ""));
            window.speechSynthesis.speak(u);
          } else { showToast("\u26A0 TextToSpeech is not available"); }
          break;
        case "canvas-clear": {
          var cc = document.querySelector("canvas[data-canvas]");
          if (cc) { var cx2 = cc.getContext("2d"); cx2.fillStyle = "#ffffff"; cx2.fillRect(0, 0, cc.width, cc.height); }
          break;
        }
        case "canvas-draw-circle": {
          var dc = document.querySelector("canvas[data-canvas]");
          if (dc) {
            var dx2 = dc.getContext("2d");
            dx2.beginPath();
            dx2.arc(Number(b.inputs.x) || 0, Number(b.inputs.y) || 0, Math.max(0.5, Number(b.inputs.r) || 10), 0, Math.PI * 2);
            dx2.fillStyle = String(b.inputs.color || "#5743d9");
            dx2.fill();
          }
          break;
        }
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

  // ---- audio ------------------------------------------------------------------
  // play-sound resolves real project media: an "asset:<id>" reference, a name
  // from the project's asset library, or an external URL. Unresolvable sounds
  // warn once per session — never a fake playback.
  var currentAudio = null;
  var warnedSounds = {};

  function assetSrc(ref) {
    return ASSET_BASE + "/api/assets/" + encodeURIComponent(ref.slice(6)) + "/raw";
  }

  function playSound(name) {
    var asset = null;
    (model.assets || []).forEach(function (a) {
      if (a.name === name && (asset === null || a.kind === "audio")) asset = a;
    });
    var src = name.indexOf("asset:") === 0
      ? assetSrc(name)
      : asset !== null
        ? assetSrc("asset:" + asset.id)
        : /^https?:\/\//.test(name) ? name : null;
    if (!src) {
      if (!warnedSounds[name]) {
        warnedSounds[name] = true;
        showToast("\u26A0 Sound \u201C" + name + "\u201D was not found \u2014 add it in Assets");
      }
      return;
    }
    try {
      var audio = new Audio(src);
      audio.play().catch(function () {});
      currentAudio = audio;
    } catch (e) { void e; }
  }

  // ---- app-studio capabilities -------------------------------------------------
  var TINYDB_PREFIX = "ideaven-tinydb:" + (document.title || "app") + ":default:";

  function firstComponentIdOf(type) {
    var id = null;
    model.screens.forEach(function (sc) {
      (function walk(nodes) {
        (nodes || []).forEach(function (n) {
          if (id) return;
          if (n.type === type) { id = n.id; return; }
          walk(n.children);
        });
      })(sc.components);
    });
    return id;
  }

  function wireSensors() {
    // Clock timers: real intervals for every enabled Clock.
    model.screens.forEach(function (sc) {
      (function walk(nodes) {
        (nodes || []).forEach(function (n) {
          if (n.type === "clock" && n.props && n.props.enabled === true && Number(n.props.interval) >= 100) {
            setInterval(function () { emit(n.id, "timer"); }, Number(n.props.interval));
          }
          if (n.type === "accelerometer-sensor" && window.DeviceMotionEvent) {
            var lastShake = 0;
            window.addEventListener("devicemotion", function (ev) {
              var a = ev.accelerationIncludingGravity;
              if (!a) return;
              componentProps[n.id].x = Number((a.x || 0).toFixed(2));
              componentProps[n.id].y = Number((a.y || 0).toFixed(2));
              componentProps[n.id].z = Number((a.z || 0).toFixed(2));
              componentProps[n.id].available = true;
              var mag = Math.hypot(componentProps[n.id].x, componentProps[n.id].y, componentProps[n.id].z);
              if (mag > 18 && Date.now() - lastShake > 800) { lastShake = Date.now(); emit(n.id, "shake"); }
            });
          }
          walk(n.children);
        });
      })(sc.components);
    });
  }

  // ---- 2D scene engine (TASK 08) ---------------------------------------------
  // Screens containing game entities (player/platform/coin/enemy/trigger/
  // sprite) play as real scenes: input, gravity, AABB collision, and dynamic
  // touches-<id> events dispatched into the same block runtime. Only the
  // player moves; solids block landing; triggers fire events.
  var ENTITY_TYPES = { player: 1, platform: 1, coin: 1, enemy: 1, trigger: 1, sprite: 1 };
  var ENTITY_DEFAULTS = {
    player: { x: 24, y: 560, width: 36, height: 36 },
    platform: { x: 24, y: 640, width: 160, height: 20 },
    coin: { x: 120, y: 520, width: 28, height: 28 },
    enemy: { x: 220, y: 560, width: 32, height: 32 },
    trigger: { x: 260, y: 480, width: 100, height: 80 },
    sprite: { x: 160, y: 300, width: 48, height: 48 }
  };
  var SCENE_GRAVITY = 1500, SCENE_MOVE = 190, SCENE_JUMP = 520;
  var sceneState = null; // persists the player across handler-triggered rerenders

  function isSceneScreen(sc) {
    return (sc.components || []).some(function (c) { return ENTITY_TYPES[c.type] === 1; });
  }
  function sceneRect(props, type) {
    var d = ENTITY_DEFAULTS[type] || { x: 16, y: 16, width: 40, height: 40 };
    var num = function (v, f) { return typeof v === "number" && isFinite(v) ? v : f; };
    return { x: num(props.x, d.x), y: num(props.y, d.y), width: num(props.width, d.width), height: num(props.height, d.height) };
  }
  function sceneVisible(props) { return props.visible !== false; }
  function sceneTrigger(type, props) {
    if (props.collider === false) return false;
    if (type === "coin" || type === "enemy" || type === "trigger") return props.trigger !== false;
    return props.trigger === true;
  }
  function sceneSolid(type, props) {
    return sceneVisible(props) && props.collider !== false && !sceneTrigger(type, props);
  }
  function overlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function buildScene(screen) {
    var keepState = sceneState && sceneState.screenId === currentScreenId ? sceneState : null;
    root.innerHTML = "";
    var bg = screen.styles && typeof screen.styles.background === "string" ? screen.styles.background : "#0c0f17";
    root.style.background = bg;
    var stage = document.createElement("div");
    stage.style.cssText = "position:relative;overflow:hidden;touch-action:none";
    stage.style.width = (root.clientWidth || 390) + "px";
    stage.style.height = (root.clientHeight || 844) + "px";
    var refs = {};
    var playerComponent = null;
    (screen.components || []).forEach(function (n) {
      if (ENTITY_TYPES[n.type] !== 1) return; // HUD text renders below
      var props = componentProps[n.id] || {};
      var r = sceneRect(props, n.type);
      var el = document.createElement("div");
      el.style.cssText = "position:absolute;user-select:none";
      el.style.left = r.x + "px"; el.style.top = r.y + "px";
      el.style.width = r.width + "px"; el.style.height = r.height + "px";
      var color = typeof props.color === "string" ? props.color : "#58c7f0";
      if (!sceneVisible(props)) el.style.display = "none";
      if (typeof props.rotation === "number" && props.rotation) el.style.transform = "rotate(" + props.rotation + "deg)";
      if (typeof props.src === "string" && props.src.trim() !== "") {
        var tex = document.createElement("img");
        tex.style.cssText = "width:100%%;height:100%%;object-fit:fill;image-rendering:pixelated;pointer-events:none";
        tex.alt = "";
        var ref = props.src.trim();
        tex.src = ref.indexOf("asset:") === 0 ? assetSrc(ref) : ref;
        el.style.overflow = "hidden";
        el.appendChild(tex);
        stage.appendChild(el);
        refs[n.id] = el;
        return;
      }
      switch (n.type) {
        case "player":
          playerComponent = n;
          el.style.borderRadius = "9px"; el.style.background = color;
          el.style.boxShadow = "inset -4px -4px 0 rgb(0 0 0 / .18)"; el.style.zIndex = 5;
          break;
        case "platform":
          el.style.background = color; el.style.borderRadius = "4px";
          el.style.boxShadow = "inset 0 2px 0 rgb(255 255 255 / .12)";
          break;
        case "coin":
          el.style.borderRadius = "50%%"; el.style.background = color;
          el.style.boxShadow = "inset -3px -3px 0 rgb(0 0 0 / .28)";
          break;
        case "enemy":
          el.style.borderRadius = "8px"; el.style.background = color;
          el.style.boxShadow = "inset -3px -3px 0 rgb(0 0 0 / .22)";
          break;
        case "trigger":
          el.style.border = "2px dashed " + color; el.style.borderRadius = "8px";
          el.style.background = color + "22";
          break;
        default:
          el.style.background = color; el.style.borderRadius = "6px"; el.style.opacity = ".92";
      }
      stage.appendChild(el);
      refs[n.id] = el;
    });
    // Non-entity positioned components (HUD text) render at their x/y.
    (screen.components || []).forEach(function (n) {
      if (ENTITY_TYPES[n.type] === 1) return;
      var props = componentProps[n.id] || {};
      var r = sceneRect(props, n.type);
      var el = document.createElement("div");
      el.style.cssText = "position:absolute;user-select:none;color:#e8ecf6;font-weight:800;letter-spacing:2px;white-space:pre-wrap";
      el.style.left = r.x + "px"; el.style.top = r.y + "px";
      el.style.fontSize = (typeof props.fontSize === "number" ? props.fontSize : 20) + "px";
      el.textContent = String(props.text || "");
      stage.appendChild(el);
    });
    root.appendChild(stage);
    if (keepState) {
      keepState.refs = refs;
      sceneState = keepState;
      return;
    }
    var spawn = playerComponent ? sceneRect(componentProps[playerComponent.id] || {}, "player") : { x: 24, y: 24 };
    sceneState = {
      screenId: currentScreenId, refs: refs, playerComponentId: playerComponent ? playerComponent.id : null,
      player: { x: spawn.x, y: spawn.y, vx: 0, vy: 0, facing: 1, grounded: false },
      spawn: { x: spawn.x, y: spawn.y }, touching: {}, keys: { left: false, right: false },
      width: stage.clientWidth || 390, height: stage.clientHeight || 844
    };
  }

  // Global input: one listener set serves whichever scene is active.
  window.addEventListener("keydown", function (ev) {
    if (!sceneState) return;
    var k = ev.key.toLowerCase();
    if (k === "arrowleft" || k === "a") { sceneState.keys.left = true; ev.preventDefault(); }
    if (k === "arrowright" || k === "d") { sceneState.keys.right = true; ev.preventDefault(); }
    if ((k === "arrowup" || k === "w" || k === " ") && sceneState.player.grounded) { ev.preventDefault(); sceneState.player.vy = -SCENE_JUMP; sceneState.player.grounded = false; }
  });
  window.addEventListener("keyup", function (ev) {
    if (!sceneState) return;
    var k = ev.key.toLowerCase();
    if (k === "arrowleft" || k === "a") sceneState.keys.left = false;
    if (k === "arrowright" || k === "d") sceneState.keys.right = false;
  });

  var sceneLast = 0;
  function sceneTick(now) {
    requestAnimationFrame(sceneTick);
    var screen = screenOf(currentScreenId);
    if (!screen || !isSceneScreen(screen) || !sceneState || sceneState.screenId !== currentScreenId || !sceneState.playerComponentId) { sceneLast = now; return; }
    var dt = Math.min((now - sceneLast) / 1000, 0.05);
    sceneLast = now;
    var p = sceneState.player;
    p.vx = (sceneState.keys.left ? -SCENE_MOVE : 0) + (sceneState.keys.right ? SCENE_MOVE : 0);
    if (p.vx !== 0) p.facing = p.vx > 0 ? 1 : -1;
    var body = { x: p.x, y: p.y, width: 36, height: 36 };
    body.x = Math.max(0, Math.min(sceneState.width - body.width, body.x + p.vx * dt));
    p.vy += SCENE_GRAVITY * dt;
    body.y += p.vy * dt;
    p.grounded = false;
    (screen.components || []).forEach(function (n) {
      if (n.id === sceneState.playerComponentId) return;
      var props = componentProps[n.id] || {};
      if (!sceneSolid(n.type, props)) return;
      var r = sceneRect(props, n.type);
      var withinX = body.x + body.width > r.x + 2 && body.x < r.x + r.width - 2;
      var feet = body.y + body.height;
      var landing = p.vy >= 0 && feet >= r.y && feet <= r.y + r.height + 10 && feet - p.vy * dt <= r.y + 4;
      if (withinX && landing) { body.y = r.y - body.height; p.vy = 0; p.grounded = true; }
    });
    if (body.y + body.height >= sceneState.height) { body.y = sceneState.height - body.height; p.vy = 0; p.grounded = true; }
    if (body.y < -60) { body.y = -60; p.vy = 0; }
    if (body.y > sceneState.height + 120) { body.x = sceneState.spawn.x; body.y = sceneState.spawn.y; p.vy = 0; sceneState.touching = {}; }
    p.x = body.x; p.y = body.y;

    var pel = sceneState.refs[sceneState.playerComponentId];
    if (pel) { pel.style.left = p.x + "px"; pel.style.top = p.y + "px"; }

    var still = {};
    (screen.components || []).forEach(function (n) {
      if (n.id === sceneState.playerComponentId) return;
      var props = componentProps[n.id] || {};
      if (!sceneTrigger(n.type, props) || !sceneVisible(props)) return;
      var r = sceneRect(props, n.type);
      if (overlap(body, r)) {
        still[n.id] = 1;
        if (!sceneState.touching[n.id]) emit(sceneState.playerComponentId, "touches-" + n.id);
      }
    });
    sceneState.touching = still;
  }
  requestAnimationFrame(sceneTick);

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
      case "h-scroll": {
        var hs = container("row");
        hs.style.overflowX = "auto"; hs.style.overflowY = "hidden";
        return hs;
      }
      case "v-scroll": {
        var vs = container("column");
        vs.style.overflowY = "auto"; vs.style.overflowX = "hidden";
        return vs;
      }
      case "table": {
        var tb = document.createElement("div");
        applyCSS(tb, styles);
        var cols = typeof props.columns === "number" && props.columns > 0 ? props.columns : 2;
        tb.style.display = "grid";
        tb.style.gridTemplateColumns = "repeat(" + cols + ", minmax(0, 1fr))";
        (node.children || []).forEach(function (child) { tb.appendChild(renderNode(child)); });
        return tb;
      }
      case "listview": {
        var lv = document.createElement("div");
        applyCSS(lv, styles);
        lv.style.alignSelf = "stretch"; lv.style.overflowY = "auto";
        var items = String(props.items || "").split("\n").map(function (x) { return x.trim(); }).filter(function (x) { return x !== ""; });
        if (items.length === 0) {
          lv.style.padding = "12px"; lv.style.color = "#9aa1b2"; lv.style.fontSize = "13px";
          lv.textContent = "ListView \u2014 no items";
          return lv;
        }
        items.forEach(function (item, i) {
          var rowBtn = document.createElement("button");
          rowBtn.type = "button";
          rowBtn.textContent = item;
          rowBtn.style.cssText = "display:block;width:100%%;text-align:left;padding:10px 12px;cursor:pointer;color:#0b0e16;font-size:inherit;background:" + (item === props.selection ? "#efecff" : "transparent") + ";border:none;" + (i === 0 ? "" : "border-top:1px solid #eef0f4;");
          rowBtn.addEventListener("click", function () {
            componentProps[node.id].selection = item;
            emit(node.id, "itemClick");
          });
          lv.appendChild(rowBtn);
        });
        return lv;
      }
      case "canvas": {
        var cv = document.createElement("canvas");
        cv.setAttribute("data-canvas", "1");
        cv.width = 390; cv.height = typeof styles.height === "number" ? styles.height : 220;
        applyCSS(cv, styles);
        cv.style.width = "100%%"; cv.style.display = "block"; cv.style.touchAction = "none";
        var cctx = cv.getContext("2d");
        cctx.fillStyle = typeof props.background === "string" ? props.background : "#ffffff";
        cctx.fillRect(0, 0, cv.width, cv.height);
        cv.addEventListener("pointerdown", function (ev) {
          var r = cv.getBoundingClientRect();
          var x = Math.round(((ev.clientX - r.left) / r.width) * 390);
          var y = Math.round(((ev.clientY - r.top) / r.height) * cv.height);
          componentProps[node.id].lastX = x; componentProps[node.id].lastY = y;
          emit(node.id, "touch");
        });
        return cv;
      }
      case "tinydb":
      case "clock":
      case "location-sensor":
      case "accelerometer-sensor":
      case "text-to-speech":
      case "sound":
      case "notifier":
      case "web":
      case "clouddb":
      case "file":
      case "webdb":
      case "activity-starter":
      case "bluetooth-client":
      case "bluetooth-server":
      case "player":
      case "image-sprite": {
        var chip = document.createElement("div");
        chip.style.cssText = "display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:4px 10px;border-radius:8px;border:1px dashed #b8bfd0;background:#f6f7fa;color:#5b6478;font-size:11.5px";
        chip.textContent = "\u25C8 " + node.type;
        return chip;
      }
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
    root.style.overflowY = screen && screen.styles && screen.styles.scrollable === true ? "auto" : "hidden";
    if (screen && isSceneScreen(screen)) { buildScene(screen); return; }
    (screen ? screen.components : []).forEach(function (c) { root.appendChild(renderNode(c)); });
  }

  rerender();
  wireSensors();
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
func writeAndroidProject(buf *bytes.Buffer, name, slug string, html []byte, format string) error {
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
		"README.md":                           []byte(androidReadme(name, format)),
		".github/workflows/build-android.yml": []byte(androidWorkflow(format)),
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

// androidReadme documents the chosen target honestly: the zip is a
// ready-to-build project; the actual APK/AAB compilation happens in Android
// Studio, on the command line with an SDK, or in the included CI workflow.
func androidReadme(name, format string) string {
	bt := "`" // markdown code tick
	if format == "aab" {
		return fmt.Sprintf("# %s \u2014 Ideaven Android export (AAB)\n\n"+
			"The app runs from %sapp/src/main/assets/index.html%s inside a WebView.\n\n"+
			"## Build the AAB (Play Store bundle)\n\n"+
			"This project is preconfigured for %sbundleDebug%s.\n\n"+
			"- **CI (no local SDK):** push to GitHub \u2014 %s.github/workflows/build-android.yml%s uploads the bundle artifact on every push.\n"+
			"- **Android Studio:** open this folder, then Build \u2192 Generate Signed Bundle.\n"+
			"- **Command line (SDK installed):** %sgradle bundleDebug%s \u2014 output at %sapp/build/outputs/bundle/debug/%s.\n",
			name, bt, bt, bt, bt, bt, bt, bt, bt, bt, bt)
	}
	return fmt.Sprintf("# %s \u2014 Ideaven Android export (APK)\n\n"+
		"The app runs from %sapp/src/main/assets/index.html%s inside a WebView.\n\n"+
		"## Build the APK\n\n"+
		"This project is preconfigured for %sassembleDebug%s.\n\n"+
		"- **CI (no local SDK):** push to GitHub \u2014 %s.github/workflows/build-android.yml%s builds %sapp-debug.apk%s on every push and uploads it as an artifact.\n"+
		"- **Android Studio:** open this folder and Run.\n"+
		"- **Command line (SDK installed):** %sgradle assembleDebug%s \u2014 output at %sapp/build/outputs/apk/debug/%s.\n\n"+
		"Prefer a Play Store bundle? Re-export with the AAB option (or run %sgradle bundleDebug%s).\n",
		name, bt, bt, bt, bt, bt, bt, bt, bt, bt, bt, bt, bt, bt, bt)
}

func androidWorkflow(format string) string {
	task, artifactPath, artifactName := "assembleDebug", "app/build/outputs/apk/debug/app-debug.apk", "app-debug"
	if format == "aab" {
		task, artifactPath, artifactName = "bundleDebug", "app/build/outputs/bundle/debug/app-debug.aab", "app-bundle"
	}
	return fmt.Sprintf(`name: build-android
on: [push]
jobs:
  android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: "17" }
      - uses: gradle/actions/setup-gradle@v3
      - run: gradle %[1]s
      - uses: actions/upload-artifact@v4
        with:
          name: %[3]s
          path: %[2]s
`, task, artifactPath, artifactName)
}

// ExportWindows writes an Electron wrapper project (zip) around the same
// standalone runtime. Compilation to a signed .exe needs a desktop OS with
// Node — the project is ready for `npm install && npm run dist` there; this
// server does not pretend to emit Windows binaries.
func (h *Handler) ExportWindows(w http.ResponseWriter, r *http.Request) {
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
	html, err := StandaloneHTML(project.Name, project.Model, "")
	if err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal, "Could not build the export. Try again shortly."))
		return
	}

	var buf bytes.Buffer
	if err := writeWindowsProject(&buf, project.Name, html); err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal, "Could not build the Windows project. Try again shortly."))
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", exportFilename(project.Slug, "-windows.zip")))
	_, _ = w.Write(buf.Bytes())
}

func writeWindowsProject(buf *bytes.Buffer, name string, html []byte) error {
	files := map[string][]byte{
		"package.json": []byte(fmt.Sprintf(`{
  "name": "ideaven-export",
  "productName": %[1]q,
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder --win portable"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3"
  },
  "build": {
    "appId": "dev.ideaven.export",
    "files": ["main.js", "app/**"],
    "win": { "target": ["portable"] }
  }
}
`, name)),
		"main.js": []byte(`const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 900,
    autoHideMenuBar: true,
    backgroundColor: "#0a0c12",
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "app", "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
`),
		"app/index.html": html,
		"README.md": []byte(fmt.Sprintf(`# %[1]s — Ideaven Windows export

A ready-to-build Electron project wrapping the standalone runtime.

## Build the .exe (needs a desktop OS with Node.js installed)

1. Install Node.js 18+ (on Windows or macOS/Linux).
2. In this folder: `+"`npm install`"+`
3. `+"`npm run dist`"+` — electron-builder produces a portable .exe under `+"`dist/`"+`.

Ideaven does not compile Windows binaries on its server — this project is
the honest, buildable path to one.
`, name)),
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
