# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Setup and Installation

```bash
pip install pre-commit
pre-commit install
bun install
```

### Development Server

```bash
bun run start-server           # Development server (default port)
bun run start-test-server      # Test server on port 8081 (production features)
bun run start-staging-server   # Test server on port 8082 (staging features)
bun run dev:cloudflare         # Store API Worker on port 8787
```

The Bun dev server proxies `/api` to `http://127.0.0.1:8787`, so the site
and the store API stay same-origin in development.

### Build and Production

```bash
bun run build                 # Production Bun build
bun run compile              # TypeScript 7 type checking (without emitting JavaScript)
```

### Code Quality

```bash
bun run lint                 # Biome linting with auto-fix
bun run format              # Biome formatting
```

### Testing

```bash
bun run test                 # Run e2e tests (requires test server running)
bun run test-headless       # Run e2e tests in headless mode
bun run ci                  # Full CI: start server + run tests
bun run ci-headless        # Full CI in headless mode

# Run specific test spec
bun run --cwd packages/frontend test \
  --test-name-pattern="loads correctly"
```

## Package Management

This project uses **Bun 1.4.2** for package management, TypeScript execution,
bundling, development servers, and unit/browser test execution. The version is
pinned in `.bun-version` and `package.json`; CI installs that same version.

Use `bun install`, `bun add --exact <package>`, and `bun run <script>`.
Commit `bun.lock` with dependency changes. JavaScript CLIs run with
`bun run --bun <command>` so their Node hashbangs also execute under Bun.
Third-party lifecycle scripts are disabled with `trustedDependencies: []`.

## Architecture Overview

This is a Bun monorepo for the DevOps Rockstars React site and Cloudflare
store backend.

### Workspace packages

- `packages/frontend` — React application, assets, Bun tooling, and browser tests
- `packages/backend` — Cloudflare Worker, D1 migrations, and Wrangler config
- `packages/shared-types` — shared API request and response types
- `packages/agent-tool` — repository shipping automation

### Core Stack

- **Frontend**: React 19+ with TypeScript in strict mode
- **Styling**: styled-components with CSS-in-JS architecture
- **Routing**: react-router with two main routes (`/` and `/company`)
- **Build**: Bun bundler with ES modules output
- **Testing**: WebDriverIO (WDIO) for end-to-end testing
- **Package Manager**: Bun for dependency management

### Application Structure

- **Layout**: Flexbox-based layout system using custom styled components
- **Background Map**: Full-screen Leaflet map rendered behind all content
- **Responsive Design**: Component-based responsive layout with flex containers

### Key Components

- `packages/frontend/src/index.tsx` - Main router and app entry point
- `packages/frontend/src/Header.tsx` - Navigation header with company link
- `packages/frontend/src/Footer.tsx` - Footer (hidden on main page)
- `packages/frontend/src/Skyline.tsx` - Main page content
- `packages/frontend/src/Company.tsx` - Company information page
- `packages/frontend/src/Map.tsx` - Full-screen Leaflet map component
- `packages/frontend/src/NotFound.tsx` - Catch-all route for unmatched paths
- `packages/frontend/src/environment.ts` - Per-environment feature flags

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
- Favicon in `packages/frontend/static/favicon/`

## Configuration Details

### TypeScript

- Extends `@tsconfig/strictest` for maximum type safety
- Configured for ESNext modules with React JSX
- Bun types included for scripts and test execution
- WebdriverIO browser types come from its standalone API

### Code Quality (Biome)

- Replaces ESLint/Prettier with single tool
- 2-space indentation, single quotes, 80-character line width
- Auto-organizes imports and fixes lint issues

### Bun bundler

- ES module output format
- Content hashing for production builds
- Source changes rebuild automatically; refresh the browser to load them
- Static SVG URLs served directly from `/static/`
- Copies static assets to build directory
- `patches/expect@30.5.2.patch` preserves Jest's named exports under Bun
  by using a namespace import for its CommonJS module

### Testing

- Bun test runner with WebdriverIO standalone browser automation
- Chrome browser automation
- Page object model in `packages/frontend/e2e/pageObjects/`
- Tests validate page loading and component visibility

## Agent Skills

Both agents ship the same skills, each discovering them from its own directory:

- `.claude/skills/<name>/SKILL.md` for Claude Code
- `.codex/skills/<name>/SKILL.md` for Codex

`ship-pr` runs the full flow: commit on a feature branch, cross-agent review and
repair, open or update the PR, address Gemini feedback, wait for CI, squash-merge
the exact reviewed head, then clean up. `address-gemini-feedback` handles review
threads and is invoked by `ship-pr`.

The skills shared by both agents are **byte-identical on purpose** and their
wording is agent-neutral, so one text serves both. The reviewer defaults to the
*other* agent from whichever is running the flow, which is the point of a
cross-agent review. `scripts/check-agent-skills-in-sync.mjs` runs in pre-commit
and fails if the copies diverge; edit one and copy it over the other.

They drive `packages/agent-tool`, which owns review isolation, PR-title
validation, and the exact-head squash merge:

```bash
bun run agent-tool                       # usage
bun run agent-tool solicitCodexReview    # or solicitClaudeCodeReview
bun run agent-tool openPr 'feat: ...'    # body from stdin
bun run agent-tool squashMerge '' "$SHA" "$BASE"
```

## Pre-commit Hooks

The project uses pre-commit hooks. After installation, hooks run automatically on commits to ensure code quality.

## Deployment

Everything runs on Cloudflare. Each environment is a pair of Workers: a
static-assets Worker for the site and a store Worker for `/api/*` with its own
D1 database.

| Environment | Site | Store API |
| --- | --- | --- |
| Production | `devopsrockstars.com` | `store.devopsrockstars.com` |
| Staging | `staging.devopsrockstars.com` | `store-staging.devopsrockstars.com` |

- `bun run deploy:staging` and `bun run deploy:prod` wrap `scripts/deploy.ts`,
  which builds the site for the environment, applies D1 migrations, then
  publishes the store and site Workers in that order
- Wrangler owns Worker and asset deployments; Terraform (`terraform/`) owns the
  custom domains and the `www` redirect
- GitHub Actions deploys the `production` branch to production and the
  `staging` branch to staging; `workflow_dispatch` deploys any branch to staging
- Frontend build artifacts are generated in `packages/frontend/build/`
- Terraform manages Cloudflare only. The AWS website stack (S3, CloudFront,
  ACM, Route 53) is destroyed; the S3 Terraform state backend is all that
  remains, so `terraform` still needs AWS credentials

### Environment feature flags

`packages/frontend/src/environment.ts` derives the environment from
`PUBLIC_ENVIRONMENT`, injected at build time by Bun's `define` option.

- The store and search are unlaunched, so **production** hides their links and
  routes; staging keeps them for testing
- **Staging** adds a `noindex` meta tag, an `X-Robots-Tag` header, and a
  disallow-all `robots.txt`, so only production is indexable
- The store JavaScript is still present in the production bundle; it simply has
  no link or route reaching it
- `packages/frontend/buildAssets.ts` generates `robots.txt` and `_headers`;
  both are covered by unit and e2e tests
