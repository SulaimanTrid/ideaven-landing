"use client";

import { useState } from "react";
import { useBuilder } from "./builder-context";
import { IconClose, IconPlus } from "@/components/visuals/icons";

/**
 * Screen list for the active project: switch screens, add, rename inline,
 * set the start screen, and delete (never the last one — a model always has
 * at least one screen).
 */
export function ScreensPanel() {
  const { model, activeScreenId, actions } = useBuilder();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const submitNew = () => {
    if (newName.trim() !== "") actions.addScreen(newName);
    setNewName("");
    setAdding(false);
  };

  const submitRename = () => {
    if (renamingId) actions.renameScreen(renamingId, renameValue);
    setRenamingId(null);
  };

  return (
    <div className="border-b border-line p-3">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <h3 className="font-mono text-[10px] tracking-[0.16em] text-mist uppercase">Screens</h3>
        <button
          type="button"
          aria-label="Add screen"
          title="Add screen"
          onClick={() => setAdding(true)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconPlus size={14} />
        </button>
      </div>

      <ul className="flex flex-col gap-0.5">
        {model.screens.map((screen) => {
          const isStart = model.navigation.startScreenId === screen.id;
          const active = screen.id === activeScreenId;
          return (
            <li key={screen.id}>
              {renamingId === screen.id ? (
                <input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={submitRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitRename();
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                  autoFocus
                  aria-label="Screen name"
                  className="h-8 w-full rounded-md border border-violet/60 bg-panel px-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                />
              ) : (
                <div
                  className={`group flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors ${
                    active ? "bg-surface-strong text-ink" : "text-fog hover:bg-surface"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => actions.selectScreen(screen.id)}
                    aria-current={active ? "true" : undefined}
                    className="min-w-0 flex-1 truncate text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                  >
                    {screen.name}
                    {isStart ? (
                      <span className="ml-1.5 rounded border border-mint/30 bg-mint/10 px-1 py-px text-[10px] font-medium text-mint">
                        Start
                      </span>
                    ) : null}
                  </button>
                  <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label={`Rename ${screen.name}`}
                      title="Rename"
                      onClick={() => {
                        setRenamingId(screen.id);
                        setRenameValue(screen.name);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded text-mist hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                        <path d="M4.5 19.5l.9-3.6L16.4 4.9a2 2 0 0 1 2.8 2.8L8.1 18.6l-3.6.9Z" />
                      </svg>
                    </button>
                    {!isStart ? (
                      <button
                        type="button"
                        aria-label={`Set ${screen.name} as start screen`}
                        title="Set as start screen"
                        onClick={() => actions.setStartScreen(screen.id)}
                        className="flex h-6 w-6 items-center justify-center rounded text-mist hover:text-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M8.2 5.6v12.8a.7.7 0 0 0 1.06.6l10.3-6.4a.7.7 0 0 0 0-1.2L9.26 5a.7.7 0 0 0-1.06.6Z" />
                        </svg>
                      </button>
                    ) : null}
                    {model.screens.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Delete ${screen.name}`}
                        title="Delete screen"
                        onClick={() => actions.deleteScreen(screen.id)}
                        className="flex h-6 w-6 items-center justify-center rounded text-mist hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                      >
                        <IconClose size={13} />
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <form
          className="mt-1.5 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            submitNew();
          }}
        >
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Screen name"
            aria-label="New screen name"
            autoFocus
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 text-[13px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
          <button
            type="submit"
            className="h-8 rounded-md bg-violet-deep px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            Add
          </button>
          <button
            type="button"
            aria-label="Cancel adding screen"
            onClick={() => setAdding(false)}
            className="h-8 rounded-md border border-line px-2 text-[12px] text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            Cancel
          </button>
        </form>
      ) : null}
    </div>
  );
}
