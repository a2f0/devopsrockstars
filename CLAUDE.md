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
pnpm run start-server          # Start development server (default port)
pnpm run start-test-server     # Start test server on port 8081
```

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
npx wdio wdio.shared.conf.ts --spec=./e2e/specs/basic.spec.ts
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

This is a React-based single-page application for DevOpsRockstars LLC with the following key characteristics:

### Core Stack
- **Frontend**: React 19+ with TypeScript in strict mode
- **Styling**: styled-components with CSS-in-JS architecture
- **Routing**: react-router-dom with two main routes (`/` and `/company`)
- **Build**: Webpack 5 with ES modules output
- **Testing**: WebDriverIO (WDIO) for end-to-end testing
- **Package Manager**: pnpm for dependency management

### Application Structure
- **Layout**: Flexbox-based layout system using custom styled components
- **Background Map**: Full-screen Leaflet map rendered behind all content
- **Responsive Design**: Component-based responsive layout with flex containers

### Key Components
- `src/index.tsx` - Main router and app entry point
- `src/Header.tsx` - Navigation header with company link
- `src/Footer.tsx` - Footer (hidden on main page)
- `src/Skyline.tsx` - Main page content
- `src/Company.tsx` - Company information page
- `src/Map.tsx` - Full-screen Leaflet map component

### Styled Components System
Located in `src/styled-components/`, provides reusable layout primitives:
- Flex container components for different alignments
- Header/Footer/Main layout components
- Menu item components
- Global styling with CSS custom properties

### Static Assets
- SVG icons and logos in `static/image/`
- Contact files (vCard, PGP key) in `static/contact/`
- Favicon in `static/favicon/`

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
- Page object model in `e2e/pageObjects/`
- Tests validate page loading and component visibility

## Pre-commit Hooks
The project uses pre-commit hooks. After installation, hooks run automatically on commits to ensure code quality.

## Deployment
- Production deployment via Vercel using GitHub Actions
- Terraform configuration for infrastructure in `terraform/` directory
- Build artifacts generated in `build/` directory
