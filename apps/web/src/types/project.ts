/**
 * Project wire types. Mirrors the Go API's shapes exactly — see
 * apps/api/internal/project/handler.go (ProjectWire) and model.go (Model).
 */

/**
 * Universal project types (7.0 M7): app/game remain the flagship guided
 * flows; the rest are valid project kinds with a Home-screen start.
 */
export type ProjectType =
  | "app"
  | "game"
  | "website"
  | "backend"
  | "api"
  | "database"
  | "experience"
  | "extension"
  | "tool"
  | "education";
export type ProjectStatus = "draft" | "published" | "archived";
export type ProjectVisibility = "private" | "unlisted" | "public";

/** Library listing options accepted by GET /api/projects. */
export type ProjectSort = "updated" | "created" | "name" | "opened";
export type ProjectStatusFilter = "draft" | "published" | "archived" | "active" | "all";

/** Open-ended property/style map stored on components and screens. */
export type PropsMap = Record<string, string | number | boolean>;

/**
 * The canonical Project Model document. The editor surfaces (visual builder,
 * blocks, code, preview) all read and write this structure.
 */
export interface ProjectModel {
  schemaVersion: number;
  type: ProjectType;
  settings: { theme: string };
  screens: ProjectModelScreen[];
  navigation: { startScreenId: string };
  variables: { id: string; name: string; type: string }[];
  assets: { id: string; kind: string; name: string }[];
}

export interface ProjectModelScreen {
  id: string;
  name: string;
  components: ProjectModelComponent[];
  /** Screen-level presentation (e.g. background) — optional in v1. */
  styles?: PropsMap;
  /** Event handlers as structured block programs — optional in v1. */
  logic?: ProjectModelLogic;
  /**
   * Custom source for this screen: authoritative code the platform does not
   * (yet) represent as blocks. Generation never overwrites it.
   */
  code?: string;
}

/**
 * Structured block program. Statements run in handler bodies; expressions
 * fill slots. The tree structure is the connection graph; component
 * references may dangle after deletion (diagnostics, never data loss).
 */
export interface ProjectModelLogic {
  handlers: ProjectModelHandler[];
}

export interface ProjectModelHandler {
  id: string;
  /** null = a screen-level event (e.g. initialize). */
  componentId: string | null;
  event: string;
  body: ProjectModelBlock[];
}

export interface ProjectModelBlock {
  id: string;
  kind: "statement" | "expression";
  type: string;
  inputs?: Record<string, string | number | boolean>;
  slots?: Record<string, ProjectModelBlock | undefined>;
  /** "then" branch of an if. */
  children?: ProjectModelBlock[];
  /** Optional "else" branch of an if. */
  elseChildren?: ProjectModelBlock[];
}

export interface ProjectModelComponent {
  id: string;
  type: string;
  props?: PropsMap;
  styles?: PropsMap;
  children?: ProjectModelComponent[];
}

/**
 * One validated AI operation (server-validated closed vocabulary). The
 * client applies these to the canonical model in a single undoable commit.
 */
export interface AIOperation {
  op: string;
  ref?: string;
  name?: string;
  screenId?: string;
  componentId?: string;
  parentId?: string;
  componentType?: string;
  index?: number;
  props?: Record<string, unknown>;
  styles?: Record<string, unknown>;
  code?: string;
  variableName?: string;
  variableType?: string;
  /** deleteHandler / updateBlockInput: which handler and block to touch. */
  handlerId?: string;
  blockId?: string;
  /** updateBlockInput: the input key to set and its scalar value. */
  input?: string;
  value?: string | number | boolean;
}

/** Full project payload — includes the canonical model document. */
export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  thumbnail: string;
  model: ProjectModel;
  modelVersion: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

/** List payload — everything except the model document. */
export type ProjectSummary = Omit<Project, "model"> & { model?: never };

export interface CreateProjectRequest {
  type: ProjectType;
  name: string;
  description?: string;
  /** Optional built-in template id; the API applies its model. */
  template?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
  total: number;
}

export interface ProjectResponse {
  project: Project;
}
