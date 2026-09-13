import type {
  ProjectModel,
  ProjectModelBlock,
  ProjectModelComponent,
  ProjectModelScreen,
  PropsMap,
} from "@/types/project";
import { imageUrl } from "@/lib/api";

/**
 * The Ideaven block runtime: a direct interpreter over the canonical block
 * IR. This is the same model the Designer, Blocks mode, and Code mode read —
 * no generated code is evaluated and no state is duplicated. One runtime
 * instance holds one "run" of the preview: fresh variable + component state,
 * live event dispatch, and screen navigation.
 */

export interface RuntimeOptions {
  /** Called when a run should show a transient message (toast). */
  onMessage: (text: string) => void;
  /** Called when the runtime navigates to another screen. */
  onNavigate: (screenId: string) => void;
  /** Project id — scopes TinyDB persistence so apps never share keys. */
  projectId?: string;
  /**
   * Called whenever the runtime mutates state the renderer should re-read
   * (async Web responses, sensor updates, clock ticks).
   */
  onUpdate?: () => void;
  /**
   * Interactive <canvas> surfaces registered by the renderer, keyed by
   * component id — draw blocks paint on the real element.
   */
  canvases?: Map<string, HTMLCanvasElement>;
  /**
   * Runtime trace: every dispatched event and how many handlers ran. The
   * preview's Diagnostics strip shows these lines so gameplay is
   * traceable — collision detected → event fired → handlers executed.
   */
  onTrace?: (line: string) => void;
}

interface ComponentState {
  props: PropsMap;
}

export interface ScreenRuntime {
  /** Re-reads the model (e.g. after an edit while previewing). */
  model: ProjectModel;
  currentScreenId: string;
  /** Component values as the run sees them (props updated by logic/input). */
  getComponentProps: (componentId: string) => PropsMap | undefined;
  /** Fire a UI event from the preview renderer. */
  emit: (componentId: string | null, event: string) => void;
  /** Stop timers/sensor listeners for this run (call before replacing it). */
  dispose: () => void;
}

/** Handlers flattened with the screen they belong to (for navigation-safe dispatch). */
interface BoundHandler {
  screenId: string;
  componentId: string | null;
  event: string;
  body: ProjectModelBlock[];
}

export function createRuntime(
  model: ProjectModel,
  startScreenId: string,
  options: RuntimeOptions,
): ScreenRuntime {
  const variables = new Map<string, string | number | boolean>();
  for (const variable of model.variables) variables.set(variable.name, "");

  const componentState = new Map<string, ComponentState>();
  for (const screen of model.screens) {
    const seed = (nodes: ProjectModelComponent[]) => {
      for (const node of nodes) {
        componentState.set(node.id, { props: { ...(node.props ?? {}) } });
        if (node.children) seed(node.children);
      }
    };
    seed(screen.components);
  }

  const runtime: ScreenRuntime = {
    model,
    currentScreenId: startScreenId,
    getComponentProps: (componentId) => componentState.get(componentId)?.props,
    emit: (componentId, event) => dispatch(componentId, event),
    dispose: () => {
      for (const handle of timers) window.clearInterval(handle);
      timers.length = 0;
      if (motionHandler) window.removeEventListener("devicemotion", motionHandler);
    },
  };

  const isTruthy = (value: unknown): boolean =>
    value === true || value === "true" || (typeof value === "number" && value !== 0) ||
    (typeof value === "string" && value !== "");

  // ---- audio -----------------------------------------------------------------
  // play-sound resolves real project media: an `asset:<id>` reference, a name
  // from the project's asset library, or an external URL. A sound that cannot
  // be resolved warns once per run — never a fake playback.

  const warnedSounds = new Set<string>();
  let currentAudio: HTMLAudioElement | null = null;

  const warnSoundOnce = (name: string, reason: string) => {
    const key = `${name}:${reason}`;
    if (warnedSounds.has(key)) return;
    warnedSounds.add(key);
    options.onMessage(`⚠ Sound “${name}” ${reason}`);
  };

  const playSound = (name: string) => {
    const asset = model.assets.find((a) => a.name === name && a.kind === "audio")
      ?? model.assets.find((a) => a.name === name);
    const src = name.startsWith("asset:")
      ? imageUrl(name)
      : asset
        ? imageUrl(`asset:${asset.id}`)
        : /^https?:\/\//.test(name)
          ? name
          : null;
    if (!src) {
      warnSoundOnce(name, "was not found — add it in Assets (audio) or use an uploaded sound's name");
      return;
    }
    try {
      const audio = new Audio(src);
      audio.addEventListener("error", () => warnSoundOnce(name, "could not be played"));
      void audio.play().catch(() => warnSoundOnce(name, "was blocked until you interact with the preview"));
      currentAudio = audio;
    } catch {
      warnSoundOnce(name, "could not be played");
    }
  };

  // ---- sensors / device capabilities -----------------------------------------
  // Everything here is the browser's real API, permission-gated where the
  // platform requires it. Absent capabilities surface as honest state, never
  // simulated readings.

  const setComponentProps = (componentId: string, patch: PropsMap) => {
    const state = componentState.get(componentId);
    if (state) Object.assign(state.props, patch);
    options.onUpdate?.();
  };

  const clockComponents = () => {
    const found: string[] = [];
    for (const screen of model.screens) {
      const visit = (nodes: ProjectModelComponent[]) => {
        for (const node of nodes) {
          if (node.type === "clock") found.push(node.id);
          if (node.children) visit(node.children);
        }
      };
      visit(screen.components);
    }
    return found;
  };

  /** Real timer intervals for every enabled Clock, cleaned up on dispose. */
  const timers: number[] = [];
  const startClocks = () => {
    for (const id of clockComponents()) {
      const state = componentState.get(id);
      if (!state) continue;
      const interval = Number(state.props.interval);
      const enabled = state.props.enabled === true;
      if (enabled && Number.isFinite(interval) && interval >= 100) {
        const handle = window.setInterval(() => {
          dispatch(id, "timer");
        }, interval);
        timers.push(handle);
      }
    }
  };
  startClocks();

  // Accelerometer: real DeviceMotion stream (fires on capable hardware only —
  // desktop browsers without sensors produce nothing, which is honest).
  let motionHandler: ((event: DeviceMotionEvent) => void) | null = null;
  if (typeof window !== "undefined" && "DeviceMotionEvent" in window) {
    const accelerometerIds: string[] = [];
    for (const screen of model.screens) {
      const visit = (nodes: ProjectModelComponent[]) => {
        for (const node of nodes) {
          if (node.type === "accelerometer-sensor") accelerometerIds.push(node.id);
          if (node.children) visit(node.children);
        }
      };
      visit(screen.components);
    }
    if (accelerometerIds.length > 0) {
      let lastShake = 0;
      motionHandler = (event) => {
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;
        const x = Number((acc.x ?? 0).toFixed(2));
        const y = Number((acc.y ?? 0).toFixed(2));
        const z = Number((acc.z ?? 0).toFixed(2));
        for (const id of accelerometerIds) {
          setComponentProps(id, { x, y, z, available: true });
        }
        const magnitude = Math.hypot(x, y, z);
        if (magnitude > 18 && Date.now() - lastShake > 800) {
          lastShake = Date.now();
          for (const id of accelerometerIds) dispatch(id, "shake");
        }
      };
      window.addEventListener("devicemotion", motionHandler);
    }
  }

  /** TinyDB: real localStorage persistence, namespaced per project. */
  const tinydbKey = (namespace: unknown, key: string) =>
    `ideaven-tinydb:${options.projectId ?? "preview"}:${str(namespace) || "default"}:${key}`;

  const tinydbComponent = () => {
    for (const screen of model.screens) {
      const visit = (nodes: ProjectModelComponent[]): ProjectModelComponent | undefined => {
        for (const node of nodes) {
          if (node.type === "tinydb") return node;
          const nested = node.children ? visit(node.children) : undefined;
          if (nested) return nested;
        }
        return undefined;
      };
      const found = visit(screen.components);
      if (found) return found;
    }
    return undefined;
  };

  const storeValue = (key: string, value: string | number | boolean) => {
    try {
      const db = tinydbComponent();
      const namespace = db?.props?.namespace;
      window.localStorage.setItem(tinydbKey(namespace, key), String(value));
    } catch {
      options.onMessage("⚠ TinyDB could not write — storage may be full or blocked");
    }
  };

  const getValue = (key: string): string => {
    try {
      const db = tinydbComponent();
      const namespace = db?.props?.namespace;
      return window.localStorage.getItem(tinydbKey(namespace, key)) ?? "";
    } catch {
      return "";
    }
  };

  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      options.onMessage("⚠ TextToSpeech is not available in this browser");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const requestLocation = () => {
    const sensors: string[] = [];
    for (const screen of model.screens) {
      const visit = (nodes: ProjectModelComponent[]) => {
        for (const node of nodes) {
          if (node.type === "location-sensor") sensors.push(node.id);
          if (node.children) visit(node.children);
        }
      };
      visit(screen.components);
    }
    const anySensor = sensors[0];
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (anySensor) setComponentProps(anySensor, { available: false });
      options.onMessage("⚠ Location is not available in this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        for (const id of sensors) {
          setComponentProps(id, {
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            available: true,
          });
        }
        for (const id of sensors) dispatch(id, "location");
      },
      (error) => {
        if (anySensor) setComponentProps(anySensor, { available: false });
        options.onMessage(`⚠ Location unavailable — ${error.message}`);
      },
      { timeout: 10000 },
    );
  };

  /** Web.get: a real network fetch; the response lands on the component. */
  const webGet = (url: string) => {
    const webs: string[] = [];
    for (const screen of model.screens) {
      const visit = (nodes: ProjectModelComponent[]) => {
        for (const node of nodes) {
          if (node.type === "web") webs.push(node.id);
          if (node.children) visit(node.children);
        }
      };
      visit(screen.components);
    }
    const target = webs[0];
    if (!target) {
      options.onMessage("⚠ Add a Web component to the screen first");
      return;
    }
    if (!/^https?:\/\//.test(url)) {
      setComponentProps(target, { response: "" });
      options.onMessage("⚠ Web.get needs an http(s) URL");
      return;
    }
    setComponentProps(target, { response: "" });
    fetch(url)
      .then((res) => res.text())
      .then((text) => {
        setComponentProps(target, { response: text.slice(0, 20000) });
        options.onUpdate?.();
      })
      .catch((err: unknown) => {
        setComponentProps(target, { response: `Error: ${String(err).slice(0, 200)}` });
        options.onUpdate?.();
      });
  };

  /** All handlers bound to this event, across every screen. */
  function handlersFor(componentId: string | null, event: string): BoundHandler[] {
    const bound: BoundHandler[] = [];
    for (const screen of model.screens) {
      for (const handler of screen.logic?.handlers ?? []) {
        if (handler.componentId === componentId && handler.event === event) {
          bound.push({ screenId: screen.id, componentId: handler.componentId, event, body: handler.body });
        }
      }
    }
    return bound;
  }

  function dispatch(componentId: string | null, event: string) {
    const handlers = handlersFor(componentId, event);
    options.onTrace?.(
      `event ${componentId ?? "screen"}:${event} → ${handlers.length} handler${handlers.length === 1 ? "" : "s"}`,
    );
    for (const handler of handlers) {
      executeBody(handler.body);
    }
  }

  function executeBody(body: ProjectModelBlock[]) {
    for (const block of body) executeBlock(block);
  }

  function executeBlock(block: ProjectModelBlock) {
    switch (block.type) {
      case "set-property": {
        const componentId = str(block.inputs?.componentId);
        const property = str(block.inputs?.property);
        const state = componentState.get(componentId);
        if (state) state.props[property] = evalExpression(block.slots?.value);
        return;
      }
      case "set-variable": {
        const name = str(block.inputs?.name);
        variables.set(name, evalExpression(block.slots?.value) as string | number | boolean);
        return;
      }
      case "change-variable": {
        const name = str(block.inputs?.name);
        const current = Number(variables.get(name));
        const delta = Number(evalExpression(block.slots?.amount));
        variables.set(name, (Number.isFinite(current) ? current : 0) + (Number.isFinite(delta) ? delta : 0));
        return;
      }
      case "play-sound":
        playSound(str(block.inputs?.sound));
        return;
      case "stop-sound":
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.currentTime = 0;
          currentAudio = null;
        }
        return;
      case "tinydb-store":
        storeValue(str(block.inputs?.key), evalExpression(block.slots?.value));
        return;
      case "notifier-alert":
        options.onMessage(String(evalExpression(block.slots?.message) ?? ""));
        return;
      case "web-get":
        webGet(str(block.inputs?.url));
        return;
      case "location-request":
        requestLocation();
        return;
      case "tts-speak":
        speak(String(evalExpression(block.slots?.message) ?? ""));
        return;
      case "canvas-clear": {
        const canvas = options.canvases?.values().next().value as HTMLCanvasElement | undefined;
        const ctx = canvas?.getContext("2d");
        if (ctx && canvas) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }
      case "canvas-draw-circle": {
        const canvas = options.canvases?.values().next().value as HTMLCanvasElement | undefined;
        const ctx = canvas?.getContext("2d");
        if (!ctx || !canvas) {
          options.onMessage("⚠ Add a Canvas component to draw on");
          return;
        }
        const x = typeof block.inputs?.x === "number" ? block.inputs.x : 0;
        const y = typeof block.inputs?.y === "number" ? block.inputs.y : 0;
        const radius = typeof block.inputs?.r === "number" ? block.inputs.r : 10;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, radius), 0, Math.PI * 2);
        ctx.fillStyle = str(block.inputs?.color) || "#5743d9";
        ctx.fill();
        options.onUpdate?.();
        return;
      }
      case "show-message":
        options.onMessage(String(evalExpression(block.slots?.message) ?? ""));
        return;
      case "navigate": {
        const target = str(block.inputs?.screenId);
        if (model.screens.some((s) => s.id === target) && target !== runtime.currentScreenId) {
          runtime.currentScreenId = target;
          options.onNavigate(target);
        }
        return;
      }
      case "if": {
        if (isTruthy(evalExpression(block.slots?.condition))) {
          executeBody(block.children ?? []);
        } else {
          executeBody(block.elseChildren ?? []);
        }
        return;
      }
      default:
        return;
    }
  }

  function evalExpression(block: ProjectModelBlock | undefined): string | number | boolean {
    if (!block) return "";
    switch (block.type) {
      case "text":
        return str(block.inputs?.value);
      case "number": {
        const value = block.inputs?.value;
        return typeof value === "number" ? value : Number(value) || 0;
      }
      case "boolean":
        return block.inputs?.value === true;
      case "get-property": {
        const componentId = str(block.inputs?.componentId);
        const property = str(block.inputs?.property);
        const state = componentState.get(componentId);
        const value = state?.props[property];
        return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? value
          : "";
      }
      case "get-variable":
        return variables.get(str(block.inputs?.name)) ?? "";
      case "join": {
        const a = evalExpression(block.slots?.a);
        const b = evalExpression(block.slots?.b);
        return `${format(a)}${format(b)}`;
      }
      case "equals": {
        const a = evalExpression(block.slots?.a);
        const b = evalExpression(block.slots?.b);
        return format(a) === format(b);
      }
      case "add": {
        const a = Number(evalExpression(block.slots?.a)) || 0;
        const b = Number(evalExpression(block.slots?.b)) || 0;
        return a + b;
      }
      case "tinydb-get":
        return getValue(str(block.inputs?.key));
      case "clock-now": {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      }
      case "location-latitude":
      case "location-longitude": {
        // Reads the LocationSensor component's live props (set by the real
        // geolocation request) — 0 until a real fix lands.
        for (const screen of model.screens) {
          const visit = (nodes: ProjectModelComponent[]): string | number | boolean => {
            for (const node of nodes) {
              if (node.type === "location-sensor") {
                const state = componentState.get(node.id);
                const key = block.type === "location-latitude" ? "latitude" : "longitude";
                return (state?.props[key] ?? 0) as string | number | boolean;
              }
              if (node.children) {
                const nested = visit(node.children);
                if (nested !== 0) return nested;
              }
            }
            return 0;
          };
          const found = visit(screen.components);
          if (found !== 0) return found;
        }
        return 0;
      }
      default:
        return "";
    }
  }

  return runtime;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function format(value: string | number | boolean): string {
  return String(value);
}

/** True when a component type has interactive behavior in the preview. */
export function isInteractiveType(type: string): boolean {
  return type === "button" || type === "text-input" || type === "password-input" || type === "checkbox" || type === "switch";
}

/** Screen lookup helper shared by the preview renderer. */
export function screenOf(model: ProjectModel, screenId: string): ProjectModelScreen | undefined {
  return model.screens.find((s) => s.id === screenId);
}
