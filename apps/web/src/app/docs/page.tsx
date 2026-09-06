import type { Metadata } from "next";

/**
 * Developer documentation (roadmap 27): a real reference of the systems that
 * exist — the project model schema, the ScreenApi, the block vocabulary, and
 * the public HTTP API. Kept in sync by hand with docs/ARCHITECTURE.md.
 */

export const metadata: Metadata = {
  title: "Docs — Ideaven",
  description: "The project model, the ScreenApi, the block vocabulary, and the HTTP API reference.",
};

const API_ENDPOINTS: Array<[string, string, string]> = [
  ["POST", "/api/auth/register", "Create an account; starts the session."],
  ["POST", "/api/auth/login", "Sign in; sets the hashed session cookie."],
  ["GET", "/api/projects", "List the signed-in account's projects."],
  ["POST", "/api/projects", "Create a project (type, name, description, optional template)."],
  ["GET", "/api/projects/{id}/model", "Fetch the canonical model document."],
  ["PUT", "/api/projects/{id}/model", "Save the model; snapshots a version (origin: edit|ai)."],
  ["GET", "/api/projects/{id}/versions", "Server-side snapshots, newest first (cap 20)."],
  ["POST", "/api/projects/{id}/publish", "Snapshot + publish; the public page goes live."],
  ["POST", "/api/projects/{id}/unpublish", "Remove the snapshot; back to draft."],
  ["GET", "/api/public/projects", "The published gallery feed."],
  ["GET", "/api/public/projects/{slug}", "One published snapshot, anonymous."],
  ["POST", "/api/public/projects/{slug}/remix", "Copy a snapshot into your account (session)."],
  ["GET", "/api/public/creators/{username}", "A creator's public identity + publications."],
  ["GET", "/api/public/stats", "Platform counters derived from real rows."],
  ["GET", "/api/templates", "Built-in starting-point models."],
  ["POST", "/api/ai/command", "AI changeset endpoint (closed vocabulary, credit-metered)."],
  ["GET", "/api/ai/credits", "Derived credit balance + reset time."],
  ["GET", "/api/projects/{id}/export/html", "Standalone single-file web export (owner)."],
  ["GET", "/api/projects/{id}/export/android", "Android WebView project zip (owner)."],
];

const BLOCKS: Array<[string, string, string]> = [
  ["set-property", "statement", "set {component}.{property} to {value}"],
  ["set-variable", "statement", "set variable {name} to {value}"],
  ["show-message", "statement", "show message {message}"],
  ["navigate", "statement", "navigate to {screenId}"],
  ["if", "statement", "if {condition} … else … (container)"],
  ["text", "expression", "a string literal"],
  ["number", "expression", "a numeric literal"],
  ["get-property", "expression", "read {component}.{property}"],
  ["get-variable", "expression", "read variable {name}"],
  ["join", "expression", "concatenate {a} {b}"],
  ["equals", "expression", "compare {a} = {b}"],
];

export default function DocsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-16">
      <p className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">Docs</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Ideaven developer reference</h1>
      <p className="mt-2 max-w-xl text-[15px] leading-7 text-fog">
        Ideaven stores every project as one canonical JSON model. The visual
        editor, the block editor, the code editor, the runtime, the AI, and the
        exports are all views over that single document.
      </p>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-ink">The project model (schema v1)</h2>
        <pre className="mt-4 overflow-x-auto rounded-2xl border border-line bg-panel p-5 font-mono text-[12px] leading-6 text-fog"><code>{`{
  "schemaVersion": 1,
  "type": "app" | "game",
  "settings": { "theme": "light" },
  "screens": [
    {
      "id": "screen-home",
      "name": "Home",
      "components": [ { "id": "c1", "type": "text",
                        "props": { "text": "Hello" },
                        "styles": { "fontSize": 28 },
                        "children": [] } ],
      "styles": { "background": "#ffffff" },
      "logic": { "handlers": [ { "id": "h1",
                                 "componentId": "c2",
                                 "event": "click",
                                 "body": [ /* Block tree */ ] } ] },
      "code": null
    }
  ],
  "navigation": { "startScreenId": "screen-home" },
  "variables": [ { "id": "v1", "name": "score", "type": "number" } ],
  "assets":    [ { "id": "…", "kind": "image", "name": "logo.png" } ]
}`}</code></pre>
        <ul className="mt-4 space-y-2 text-[13.5px] leading-6 text-fog">
          <li>
            <strong className="text-ink">Components</strong> nest only inside
            containers (column, row, card, container). IDs are unique per
            screen; the validator enforces structure on every save.
          </li>
          <li>
            <strong className="text-ink">logic.handlers</strong> are structured
            block programs. <strong className="text-ink">code</strong> holds
            anything outside the block subset; generation never overwrites it.
          </li>
          <li>
            <strong className="text-ink">Assets</strong> are references —
            binaries live in storage, addressed as{" "}
            <code className="font-mono text-[12px]">asset:&lt;id&gt;</code>.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-ink">The block vocabulary</h2>
        <p className="mt-2 text-[13.5px] leading-6 text-fog">
          Blocks compile deterministically to TypeScript and execute directly
          in the runtime — one IR, three consumers.
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-panel font-mono text-[11px] tracking-[0.12em] text-mist uppercase">
              <tr>
                <th className="px-4 py-2.5">Block</th>
                <th className="px-4 py-2.5">Kind</th>
                <th className="px-4 py-2.5">Surface</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-card text-fog">
              {BLOCKS.map(([type, kind, surface]) => (
                <tr key={type}>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink">{type}</td>
                  <td className="px-4 py-2.5">{kind}</td>
                  <td className="px-4 py-2.5">{surface}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-ink">The ScreenApi (custom code)</h2>
        <p className="mt-2 text-[13.5px] leading-6 text-fog">
          Screen code is TypeScript against a tiny, closed API. It runs in
          Preview, in the public page, and in the exports.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-2xl border border-line bg-panel p-5 font-mono text-[12px] leading-6 text-fog"><code>{`import type { ScreenApi } from "@ideaven/runtime";

api.onComponent("c2", "click", () => {
  api.setVariable("score", api.getVariable("score") + 1);
  api.setProperty("c1", "text", "Clicked");
  if (api.equals(api.getProperty("c2", "label"), "Start")) {
    api.navigate("screen-game");
  }
  api.show("Welcome!");
});`}</code></pre>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-ink">HTTP API</h2>
        <p className="mt-2 text-[13.5px] leading-6 text-fog">
          Session auth via an HttpOnly cookie; every project-scoped route is
          owner-checked server-side. Public routes answer anonymously from
          published snapshots only.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-left text-[13px]">
            <tbody className="divide-y divide-line bg-card text-fog">
              {API_ENDPOINTS.map(([method, path, description]) => (
                <tr key={method + path}>
                  <td className="w-14 px-4 py-2.5 font-mono text-[11.5px] font-semibold text-violet">{method}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink">{path}</td>
                  <td className="px-4 py-2.5">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-ink">AI changesets</h2>
        <p className="mt-2 text-[13.5px] leading-6 text-fog">
          The AI endpoint answers with a closed-vocabulary changeset —
          createScreen, createComponent, updateComponent, deleteComponent,
          createVariable, deleteVariable, setStartScreen, setScreenCode,
          deleteHandler, updateBlockInput. The server validates every
          operation before the client sees it; the client applies the set as
          one undoable commit and labels the snapshot it makes. Unknown or
          malformed operations reject the whole response — a half-valid
          changeset can never reach the model.
        </p>
      </section>
    </main>
  );
}
