"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { projectApi } from "@/lib/api";
import { useTheme } from "@/theme/theme-provider";
import { cn } from "@ideaven/ui";

/**
 * The Command Center (roadmap 4.0 M5 / 7.0 M44, M263): one Ctrl+K surface
 * connecting navigation, projects, creation, and theme. Context-aware —
 * inside the builder it also exposes mode switches and panels; everywhere
 * it searches the user's projects and the platform's main destinations.
 * Keyboard-first: ↑/↓ move, Enter runs, Esc closes.
 */

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: "Actions" | "Navigate" | "Projects" | "Project" | "Builder" | "Theme";
  keywords?: string;
  run: () => void;
}

interface ProjectHit {
  id: string;
  name: string;
  type: string;
}

/** One searchable object inside the open project (M5 universal search). */
interface ProjectObjectHit {
  id: string;
  label: string;
  hint: string;
  jump: { screenId: string; componentId?: string; handlerId?: string };
}

function isBuilderPath(path: string): boolean {
  return /^\/builder\/[^/]+/.test(path);
}

function builderProjectId(path: string): string | null {
  const match = path.match(/^\/builder\/([0-9a-f-]{36})/i);
  return match ? match[1]! : null;
}

export function CommandPalette() {
  const router = useRouter();
  const { setTheme, resolved } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectHit[] | null>(null);
  const [objects, setObjects] = useState<ProjectObjectHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Builder context (mode switching) is read lazily via a DOM hook: the
  // palette is platform-chrome, not a builder consumer, so it dispatches
  // clicks on the real mode buttons instead of importing builder context.
  const pathname = usePathnameSafe();
  const builderPath = isBuilderPath(pathname);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
      if (event.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // M5 universal search: inside a builder, index the open project's
  // screens, components, handlers, blocks, variables, and assets.
  useEffect(() => {
    if (!open || !builderPath) return;
    const projectId = builderProjectId(pathname);
    if (!projectId) return;
    let cancelled = false;
    projectApi
      .get(projectId)
      .then(({ project }) => {
        if (cancelled) return;
        const model = project.model;
        const hits: ProjectObjectHit[] = [];
        const eventName = (event: string) => event.replace(/^touches-/, "touches ");
        for (const screen of model.screens) {
          hits.push({ id: `screen-${screen.id}`, label: screen.name, hint: "screen", jump: { screenId: screen.id } });
          const walk = (nodes: typeof screen.components, depth: number) => {
            for (const node of nodes) {
              const label = String(node.props?.text ?? node.props?.label ?? "") || node.type;
              hits.push({
                id: `comp-${node.id}`,
                label: `${label} (${node.type})`,
                hint: depth === 0 ? "component" : `in ${screen.name}`,
                jump: { screenId: screen.id, componentId: node.id },
              });
              if (node.children) walk(node.children, depth + 1);
            }
          };
          walk(screen.components, 0);
          for (const handler of screen.logic?.handlers ?? []) {
            const body = (function count(blocks: typeof handler.body): number {
              return blocks.reduce((n, b) => n + 1 + count(b.children ?? []) + count(b.elseChildren ?? []), 0);
            })(handler.body);
            hits.push({
              id: `handler-${handler.id}`,
              label: `when ${handler.componentId ?? "screen"} ${eventName(handler.event)}`,
              hint: `${body} block${body === 1 ? "" : "s"}`,
              jump: { screenId: screen.id, handlerId: handler.id },
            });
          }
        }
        for (const variable of model.variables) {
          hits.push({ id: `var-${variable.id}`, label: variable.name, hint: "variable", jump: { screenId: model.navigation.startScreenId || model.screens[0]?.id || "" } });
        }
        for (const asset of model.assets) {
          hits.push({ id: `asset-${asset.id}`, label: asset.name, hint: "asset", jump: { screenId: model.navigation.startScreenId || model.screens[0]?.id || "" } });
        }
        setObjects(hits);
      })
      .catch(() => setObjects([]));
    return () => {
      cancelled = true;
    };
  }, [open, builderPath, pathname]);

  useEffect(() => {
    if (open && projects === null) {
      projectApi
        .list({ status: "active" })
        .then((res) =>
          setProjects(
            res.projects.map((p: { id: string; name: string; type: string }) => ({
              id: p.id, name: p.name, type: p.type,
            })),
          ),
        )
        .catch(() => setProjects([]));
    }
  }, [open, projects]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const navigate = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const clickBuilderButton = useCallback(
    (label: string) => {
      close();
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === label,
      );
      button?.click();
    },
    [close],
  );

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: "new-project", label: "Create a new project", group: "Actions", keywords: "add start build", run: () => navigate("/dashboard/projects/new") },
      { id: "nav-projects", label: "Open Projects", group: "Navigate", run: () => navigate("/dashboard/projects") },
      { id: "nav-templates", label: "Open Templates", group: "Navigate", run: () => navigate("/dashboard/templates") },
      { id: "nav-extensions", label: "Open Extensions", group: "Navigate", run: () => navigate("/dashboard/extensions") },
      { id: "nav-explore", label: "Open Explore", group: "Navigate", keywords: "gallery community projects", run: () => navigate("/explore") },
      { id: "nav-community", label: "Open Community", group: "Navigate", run: () => navigate("/community") },
      { id: "nav-learn", label: "Open Learn", group: "Navigate", keywords: "docs tutorials", run: () => navigate("/learn") },
      { id: "nav-docs", label: "Open Documentation", group: "Navigate", run: () => navigate("/docs") },
      { id: "nav-pricing", label: "Open Pricing", group: "Navigate", run: () => navigate("/pricing") },
      { id: "nav-settings", label: "Open Settings", group: "Navigate", run: () => navigate("/settings") },
      { id: "theme-toggle", label: resolved === "dark" ? "Switch to light theme" : "Switch to dark theme", group: "Theme", keywords: "dark light appearance", run: () => { close(); setTheme(resolved === "dark" ? "light" : "dark"); } },
    ];
    if (builderPath) {
      list.push(
        { id: "mode-design", label: "Switch to Design mode", group: "Builder", run: () => clickBuilderButton("Design") },
        { id: "mode-blocks", label: "Switch to Blocks mode", group: "Builder", keywords: "visual programming", run: () => clickBuilderButton("Blocks") },
        { id: "mode-code", label: "Switch to Code mode", group: "Builder", run: () => clickBuilderButton("Code") },
        { id: "mode-preview", label: "Switch to Preview mode", group: "Builder", keywords: "run play", run: () => clickBuilderButton("Preview") },
        { id: "mode-insights", label: "Switch to Insights mode", group: "Builder", keywords: "health map dna brain", run: () => clickBuilderButton("Insights") },
        { id: "panel-assets", label: "Open Assets panel", group: "Builder", run: () => clickBuilderButton("Assets") },
        { id: "panel-ask", label: "Ask AI", group: "Builder", keywords: "agent assistant", run: () => clickBuilderButton("Ask AI") },
      );
    }
    return list;
  }, [builderPath, clickBuilderButton, close, navigate, resolved, setTheme]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const matching = commands.filter(
      (c) => q === "" || c.label.toLowerCase().includes(q) || (c.keywords ?? "").includes(q),
    );
    const projectHits: Command[] =
      projects === null
        ? []
        : projects
            .filter((p) => q === "" || p.name.toLowerCase().includes(q))
            .slice(0, 5)
            .map((p) => ({
              id: `project-${p.id}`,
              label: p.name,
              hint: p.type,
              group: "Projects" as const,
              run: () => navigate(`/builder/${p.id}`),
            }));
    const objectHits: Command[] =
      builderPath && q !== ""
        ? objects
            .filter((o) => o.label.toLowerCase().includes(q) || o.hint.toLowerCase().includes(q))
            .slice(0, 8)
            .map((o) => ({
              id: o.id,
              label: o.label,
              hint: o.hint,
              group: "Project" as const,
              run: () => {
                close();
                window.dispatchEvent(
                  new CustomEvent("ideaven:palette-jump", { detail: o.jump }),
                );
              },
            }))
        : [];
    return [...projectHits, ...objectHits, ...matching];
  }, [commands, projects, objects, q, navigate, builderPath, close]);

  useEffect(() => setActive(0), [query]);

  const runActive = () => {
    const command = filtered[active];
    if (command) command.run();
  };

  const onInputKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runActive();
    }
  };

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command center"
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search projects, jump anywhere, run a command…"
          aria-label="Search commands"
          className="h-12 w-full border-b border-line bg-transparent px-4 text-[14px] text-ink placeholder:text-mist focus-visible:outline-none"
        />
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-mist">Nothing matches “{query}”.</p>
        ) : (
          <ul ref={listRef} role="listbox" aria-label="Commands" className="max-h-[50vh] overflow-y-auto p-1.5">
            {filtered.map((command, index) => {
              const showGroup = command.group !== lastGroup;
              lastGroup = command.group;
              return (
                <li key={command.id} role="option" aria-selected={index === active}>
                  {showGroup ? (
                    <p className="px-2 pb-0.5 pt-2 font-mono text-[9.5px] tracking-[0.16em] text-mist uppercase">
                      {command.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={command.run}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint",
                      index === active ? "bg-surface-strong text-ink" : "text-fog",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.hint ? (
                      <span className="shrink-0 font-mono text-[10px] uppercase text-mist">{command.hint}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[10.5px] text-mist">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
          <span className="ml-auto">Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}

// The palette is platform chrome: it reads the pathname, not builder state.
function usePathnameSafe(): string {
  return usePathname() ?? "";
}
