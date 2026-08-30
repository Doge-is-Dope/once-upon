# Dependency Compatibility Record

Verified locally on 2026-08-30 with Node 24.15.0 and pnpm 11.24.0.

## Frozen candidate group

- React, React DOM, and React Server DOM Webpack: 19.2.8
- Vinext: 1.0.0-beta.8
- Vite: 8.2.2
- `@vitejs/plugin-react`: 6.1.1
- `@vitejs/plugin-rsc`: 0.5.34
- `@openai/sites-vite-plugin`: 0.2.0
- TypeScript: 7.0.2
- Vitest: 4.1.11
- Playwright: 1.62.1

TypeScript 7.0.2 passed route generation, strict type checking, unit tests, and
the production build. No fallback to TypeScript 6.0.3 or 5.9.3 was needed.

The scaffold's `react/react-compiler` oxlint rule was removed because oxlint
1.80.0 no longer exposes that rule under the React plugin. This was a lint
configuration compatibility repair, not a dependency rollback.

The pnpm workspace explicitly allows build scripts only for `esbuild` and
`workerd`, which are required by the pinned Vite and local Cloudflare runtime.
The generated lockfile passed pnpm's supply-chain policy verification.

## Verification commands

```sh
corepack pnpm@11.24.0 run typecheck
corepack pnpm@11.24.0 run lint
corepack pnpm@11.24.0 run test
corepack pnpm@11.24.0 run test:e2e
corepack pnpm@11.24.0 run build
corepack pnpm@11.24.0 audit --prod
```

The actual ChatGPT in-app browser remains a separate release gate. Local
Chromium tests exercise the same imperative `document.modelContext.registerTool`
shape with dynamic tool registration and reload-persistent IndexedDB state.
