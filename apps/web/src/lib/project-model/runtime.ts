import type {
  ProjectModel,
  ProjectModelBlock,
  ProjectModelComponent,
  ProjectModelScreen,
  PropsMap,
} from "@/types/project";

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
  };

  const isTruthy = (value: unknown): boolean =>
    value === true || value === "true" || (typeof value === "number" && value !== 0) ||
    (typeof value === "string" && value !== "");

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
