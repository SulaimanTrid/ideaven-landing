# IDEAVEN Product Model

How the three creation domains map onto one architecture. The canonical
Project Model (`apps/api/internal/project/model.go` — JSONB: screens,
component trees, logic.handlers as block programs, variables, assets) is the
single source of truth; nothing below forks it.

```
                 IDEAVEN CORE
                      |
     +----------------+----------------+
     |                |                |
 APP STUDIO      GAME STUDIO      EXTENSION STUDIO
 (screens/UI/    (scenes/         (manifest/components/
  forms/nav)      gameplay*)       blocks/build)
     |                |                |
     +----------------+----------------+
                      |
          CANONICAL PROJECT MODEL
                      |
          +-----------+-----------+
          |                       |
       BLOCKS (canvas)         CODE (TS + source map)
          \                       /
           +----------+----------+
                      |
                 AI (plan→apply, memory+intent)
                      |
                  RUNTIME (preview)
                      |
                  EXPORT (web/android/windows)
```

- **App Studio**: screens, layout components, forms, navigation, data
  blocks. Palette leads with UI categories.
- **Game Studio**: same model, gameplay-flavored palette order; templates
  ship playable logic (Coin Runner). *Scene/sprite/collision IR is the next
  engine milestone (gap analysis G3/G4).*
- **Extension Studio**: authored extensions (manifest, source, docs,
  versions, build) — installed extensions contribute namespaced blocks to
  the palette; runtime providers are the next milestone.
- **Blocks ↔ Code**: blocks are the source; codegen is deterministic with a
  block↔line map; hand-authored screen `code` is authoritative and never
  overwritten; unsupported constructs render as CODE-ONLY, never deleted.
- **AI**: changesets over a closed operation vocabulary, validated
  server-side, applied as one undoable commit, previewed before apply.
- **Runtime/Export**: one vanilla runtime interprets the model for preview,
  the web export, and all native wrapper exports.
