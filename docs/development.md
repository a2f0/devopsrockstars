# Development and repository layout

Use the [README](../README.md) for quick setup and normal entrypoints. Agent
validation and shipping requirements are in [AGENTS.md](../AGENTS.md).

## Setup and installation

```bash
mise install
pip install pre-commit==4.7.0
pre-commit install
bun install
```

## Development servers

```bash
bun run start-server           # Development server (default port)
bun run start-test-server      # Test server on port 8081 (production features)
bun run start-staging-server   # Test server on port 8082 (staging features)
bun run dev:cloudflare         # Store API Worker on port 8787
```

The Bun dev server proxies `/api` to `http://127.0.0.1:8787`, so the site
and the store API stay same-origin in development. The
[backend README](../packages/backend/README.md#local-development) sets up the
local store database, secrets, inventory, and an admin account.

## Builds

```bash
bun run build                 # Production Bun build
bun run compile              # TypeScript 7 type checking (without emitting JavaScript)
```

## Code quality

```bash
bun run lint                 # Biome linting with auto-fix
bun run format              # Biome formatting
```

## Testing

```shell
bun run ci
bun run ci-headless
```

Start the testing Bun server (on different port than normal development server) and run tests manually.

```shell
bun run start-test-server      # :8081, production feature set
bun run start-staging-server   # :8082, staging feature set
# in a different console tab
bun run test
bun run test-headless
```

In CI, `e2e/specs/basic.spec.ts` runs against a production build on :8081 with
every flag off; `e2e/specs/staging.spec.ts` runs against a staging build on :8082
with every flag on. These fixed test profiles keep both behaviors covered when
the rollout configuration changes. The manual development servers above use
the committed matrix; use `bun run ci` or `bun run ci-headless` for the fixed
test profiles regardless of the current rollout.

`e2e/specs/feature-flags.spec.ts` also builds each flag enabled by itself in both
environments and checks navigation, routes, background preparation, viewer
assets, and the published flag manifest. Unit tests check the committed matrix
and reject incomplete or invalid configuration.

`e2e/specs/mobile.spec.ts` covers both environments with Chromium phone viewport
and touch emulation, including portrait, landscape, and viewport height changes.

Run tests whose names match a pattern

```shell
bun run --cwd packages/frontend test \
  --test-name-pattern="loads correctly"
```

## Package management

This project uses **Bun 1.4.3** for package management, TypeScript execution,
bundling, development servers, and unit/browser test execution. TypeScript
**7.0.2** only checks types; Bun transpiles and bundles the application. The
Bun version is pinned in `.mise.toml` and `package.json`; CI installs it with
`mise-action`. When mise is not activated, agent shells using its default data
directory should put `~/.local/share/mise/installs/bun/1.4.3/bin` first on
`PATH`.

Use `bun install`, `bun add --exact <package>`, and `bun run <script>`.
Commit `bun.lock` with dependency changes. JavaScript CLIs run with
`bun run --bun <command>` so their Node hashbangs also execute under Bun.
Third-party lifecycle scripts are disabled with `trustedDependencies: []`.

## Architecture Overview

This is a Bun monorepo for the DevOpsRockstars React site and Cloudflare
store backend.

### Workspace packages

- [`packages/frontend`](../packages/frontend/README.md) — React application, assets, Bun tooling, and browser tests
- [`packages/backend`](../packages/backend/README.md) — Cloudflare Worker, D1 migrations, and Wrangler config
- `packages/shared-types` — shared API request and response types
- `packages/diagnostics` — private browser and Worker Sentry error reporting

### Module layering

Dependencies point one way, and `biome.json` enforces it in every lint run
(the pre-commit hook and CI):

- `shared-types` and `diagnostics` are leaf packages: they import no other
  workspace package, application, or script.
- The Worker (`packages/backend/src`) imports the leaf packages but never the
  frontend, `scripts/`, or browser diagnostics. Its test harnesses
  (`localWorker.ts`, `testDatabase.ts`, and tests) may start the frontend
  server.
- Browser code (`packages/frontend/src`) imports the leaf packages but never
  the Worker, `tooling/`, `e2e/`, `scripts/`, server diagnostics, or Node
  built-ins; API shapes come from `@devopsrockstars/shared-types`.
- `packages/frontend/src/store/hat` is the three.js geometry layer: no React or
  styling, and nothing from outside `store/hat`. `hatModel.ts` and
  `hatViewer.ts` adapt it for the store.
- `scripts/` and each package's `tooling/` and `e2e/` sit on top and may import
  any package.

`suspicious/noImportCycles` rejects import cycles, including type-only ones.

### Core Stack

- **Frontend**: React 19+ with TypeScript in strict mode
- **Styling**: styled-components with CSS-in-JS architecture
- **Routing**: react-router with `/` and `/company` plus flag-controlled store/search routes
- **Build**: Bun bundler with ES modules output
- **Testing**: WebDriverIO (WDIO) for end-to-end testing
- **Package Manager**: Bun for dependency management

### Application Structure

- **Layout**: Flexbox-based layout system using custom styled components
- **Home**: Shared interactive 3D skyline, with the original drawing in its control bar
- **Responsive Design**: Component-based responsive layout with flex containers

### Key Components

- `packages/frontend/src/index.tsx` - Main router and app entry point
- `packages/frontend/src/clickTracking.ts` - Click tracker lifecycle, origin/environment guard, and safe route names
- `packages/frontend/src/Header.tsx` - Navigation header with company link
- `packages/frontend/src/Footer.tsx` - Footer (hidden on main page)
- `packages/frontend/src/Skyline.tsx` - Main page content
- `packages/frontend/src/Company.tsx` - Company information page
- `packages/frontend/src/Map.tsx` - Full-screen Leaflet map component
- `packages/frontend/src/admin/` - Lazily loaded store admin under `/admin`
- `packages/frontend/src/NotFound.tsx` - Catch-all route for unmatched paths
- `packages/frontend/src/pages.ts` - Every route's title, description, and indexing, prerendered by the build
- `packages/frontend/src/pageHead.ts` - Each page's head tags, prerendered by the build and reapplied on navigation
- `feature-flags.json` - Explicit production/staging rollout values
- `packages/frontend/src/featureFlags.ts` - Typed flag registry and browser values
- `packages/frontend/src/environment.ts` - Environment parsing and store API origin

### Styled Components System

Located in `packages/frontend/src/styled-components/`, these files provide
reusable layout primitives:

- Flex container components for different alignments
- Header/Footer/Main layout components
- Menu item components
- Global styling with CSS custom properties

### Static Assets

- SVG icons and logos in `packages/frontend/static/image/`
- Contact files in `packages/frontend/static/contact/`
- Brand logo in `assets/brand/logo.svg`, a plain static SVG. The `favicons`
  target in `agent-tool.json` renders `favicon.svg`, `favicon.ico`, and
  `apple-touch-icon.png` from it, and the `social` target renders the
  1200×630 share image `og-image.png`, with `agent-tool images build` on every
  development and production build. The site serves them from its root.
  Rendered images are never committed.

## Configuration Details

### TypeScript

- Extends `@tsconfig/strictest` for maximum type safety
- Configured for ESNext modules with React JSX
- Bun types included for scripts and test execution
- WebdriverIO browser types come from its standalone API

### Code quality (Biome)

- Replaces ESLint/Prettier with single tool
- 2-space indentation, single quotes, 80-character line width
- Auto-organizes imports and fixes lint issues

### Bun bundler

- ES module output format
- Content hashing for production builds
- Source changes rebuild automatically; refresh the browser to load them
- Static SVG URLs served directly from `/static/`
- Copies static assets to build directory
- Renders the brand favicons and share image into every bundle, served at the site root
- `patches/expect@30.5.2.patch` preserves Jest's named exports under Bun
  by using a namespace import for its CommonJS module

### Browser tooling

- Bun test runner with WebdriverIO standalone browser automation
- Chrome browser automation
- Page object model in `packages/frontend/e2e/pageObjects/`
- Tests validate page loading and component visibility

## Maintenance script layout

Root package commands keep their existing names. Internal helpers are grouped by
purpose under `scripts/`: `checks/` for repository policy and dependency checks,
`testing/` for browser-server orchestration, `dev/` for feature-flag and Skyline
maintenance, `release/` for the version/HTML adapter, `deploy/` for guarded
Worker and Terraform behavior, and `admin/` for the store admin account CLI. Tests stay beside the behavior they exercise.
Workspace application build/server entrypoints remain under each package's
`tooling/`; Terraform retains its cohesive native directory.

Update imports, root discovery, package commands, CI, tests, and documentation
when moving a script. Shared agent mechanics come from the exact agent-tool pin;
application-specific previews and server lifecycles remain repository-owned.

[Feature flags](feature-flags.md) owns rollout configuration.
[Deployment](deployment.md) owns environment, analytics, infrastructure, and store
operations. [Dependency maintenance](dependency-maintenance.md) owns active
compatibility constraints and upgrade previews. Keep these procedures in their
authoritative guide instead of duplicating them in README or agent policy.

## Shared workflow commands

`bun run check` records the existing pre-commit, flag, unit, and complete browser
gates with the pinned agent-tool. The browser runner remains repository-owned
because it starts and stops this application's servers and verifies their ports.
Pre-commit remains the hook framework. CI checks the explicit branch name with
`bun run lint:branch-name <name>`; feature branches use `<type>/<topic>` and
`main`/`staging` remain exempt without an added length cap. Shared PR and review
mechanics come from the managed skills; conventional commit requirements and the
guarded deployment remain repository policy.
