# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Setup and Installation

```bash
pip install pre-commit
pre-commit install
pnpm install
```

### Development Server

```bash
pnpm run start-server           # Development server (default port)
pnpm run start-test-server      # Test server on port 8081 (production features)
pnpm run start-staging-server   # Test server on port 8082 (staging features)
pnpm run dev:cloudflare         # Store API Worker on port 8787
```

The webpack dev server proxies `/api` to `http://127.0.0.1:8787`, so the site
and the store API stay same-origin in development.

### Build and Production

```bash
pnpm run build                 # Production webpack build
pnpm run compile              # TypeScript compilation (runs automatically in prepare/pretest)
```

### Code Quality

```bash
pnpm run lint                 # Biome linting with auto-fix
pnpm run format              # Biome formatting
```

### Testing

```bash
pnpm run test                 # Run e2e tests (requires test server running)
pnpm run test-headless       # Run e2e tests in headless mode
pnpm run ci                  # Full CI: start server + run tests
pnpm run ci-headless        # Full CI in headless mode

# Run specific test spec
pnpm --filter @devopsrockstars/frontend exec wdio wdio.shared.conf.ts \
  --spec=./e2e/specs/basic.spec.ts
```

## Package Management

This project uses **pnpm** instead of npm for package management. Key benefits:

- Faster installs due to content-addressable storage
- Disk space efficiency through hard linking
- Stricter dependency resolution

Always use `pnpm` commands instead of `npm`:

- `pnpm install` instead of `npm install`
- `pnpm add <package>` instead of `npm install <package>`
- `pnpm run <script>` instead of `npm run <script>`

## Architecture Overview

This is a pnpm monorepo for the DevOps Rockstars React site and Cloudflare
store backend.

### Workspace packages

- `packages/frontend` — React application, assets, Webpack, and browser tests
- `packages/backend` — Cloudflare Worker, D1 migrations, and Wrangler config
- `packages/shared-types` — shared API request and response types
- `packages/agent-tool` — repository shipping automation

### Core Stack

- **Frontend**: React 19+ with TypeScript in strict mode
- **Styling**: styled-components with CSS-in-JS architecture
- **Routing**: react-router with two main routes (`/` and `/company`)
- **Build**: Webpack 5 with ES modules output
- **Testing**: WebDriverIO (WDIO) for end-to-end testing
- **Package Manager**: pnpm for dependency management

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
- WebDriverIO types included for testing

### Code Quality (Biome)

- Replaces ESLint/Prettier with single tool
- 2-space indentation, single quotes, 80-character line width
- Auto-organizes imports and fixes lint issues

### Webpack

- ES module output format
- Content hashing for production builds
- SVG handling via @svgr/webpack + url-loader
- Copies static assets to build directory

### Testing

- WebDriverIO with Mocha framework
- Chrome browser automation
- Page object model in `packages/frontend/e2e/pageObjects/`
- Tests validate page loading and component visibility

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

- `pnpm run deploy:staging` and `pnpm run deploy:prod` wrap `scripts/deploy.sh`,
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
`PUBLIC_ENVIRONMENT`, injected at build time by webpack's `DefinePlugin`.
Staging drops the store and search routes and links, and adds a `noindex`
meta tag, an `X-Robots-Tag` header, and a disallow-all `robots.txt`. The store
JavaScript is still present in the staging bundle; it simply has no link or
route reaching it. `packages/frontend/buildAssets.ts` generates the `robots.txt`
and `_headers` files, and both are covered by unit and e2e tests.
