# @ideaven/config

Shared configuration bases for the Ideaven monorepo.

- `tsconfig/base.json` — strict TypeScript defaults shared by every package.
- `tsconfig/next.json` — base + DOM/JSX settings for Next.js apps.

Packages extend these by relative path, for example from `apps/web`:

```json
{ "extends": "../../packages/config/tsconfig/next.json" }
```
