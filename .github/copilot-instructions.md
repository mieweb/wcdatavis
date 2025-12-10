## DataVis Project Overview

DataVis is a library for data visualization with presentation via charts and tables (graphs and grids). The architecture is a modular pipeline: **Source** → **View** → **Grid/Graph**.

- **Source**: Fetches and decodes data (HTTP, File, Local), handles type conversion
- **View**: Implements filtering, grouping, pivotting, and aggregation
- **Grid/Graph**: Renders data with UI controls for user interaction

## Code Quality Principles

<!-- https://github.com/mieweb/template-mieweb-opensource/blob/main/.github/copilot-instructions.md -->

### 🎯 DRY (Don't Repeat Yourself)
- **Never duplicate code**: If you find yourself copying code, extract it into a reusable function
- **Single source of truth**: Each piece of knowledge should have one authoritative representation
- **Refactor mercilessly**: When you see duplication, eliminate it immediately
- **Shared utilities**: Common patterns should be abstracted into utility functions

### 💋 KISS (Keep It Simple, Stupid)
- **Simple solutions**: Prefer the simplest solution that works
- **Avoid over-engineering**: Don't add complexity for hypothetical future needs
- **Clear naming**: Functions and variables should be self-documenting
- **Small functions**: Break down complex functions into smaller, focused ones
- **Readable code**: Code should be obvious to understand at first glance

### 🧹 Folder Philosophy
- **Clear purpose**: Every folder should have a main thing that anchors its contents.
- **No junk drawers**: Don’t leave loose files without context or explanation.
- **Explain relationships**: If it’s not elegantly obvious how files fit together, add a README or note.
- **Immediate clarity**: Opening a folder should make its organizing principle clear at a glance.

### 🔄 Refactoring Guidelines
- **Continuous improvement**: Refactor as you work, not as a separate task
- **Safe refactoring**: Always run tests before and after refactoring
- **Incremental changes**: Make small, safe changes rather than large rewrites
- **Preserve behavior**: Refactoring should not change external behavior
- **Code reviews**: All refactoring should be reviewed for correctness

### ⚰️ Dead Code Management
- **Immediate removal**: Delete unused code immediately when identified
- **Historical preservation**: Move significant dead code to `.attic/` directory with context
- **Documentation**: Include comments explaining why code was moved to attic
- **Regular cleanup**: Review and clean attic directory periodically
- **No accumulation**: Don't let dead code accumulate in active codebase

## HTML & CSS Guidelines
- **Semantic Naming**: Every `<div>` and other structural element must use a meaningful, semantic class name that clearly indicates its purpose or role within the layout.
- **CSS Simplicity**: Styles should avoid global resets or overrides that affect unrelated components or default browser behavior. Keep changes scoped and minimal.
- **SASS-First Approach**: All styles should be written in SASS (SCSS) whenever possible. Each component should have its own dedicated SASS file to promote modularity and maintainability.

## JavaScript Code Standards

### 🎯 Modern JavaScript (ES6+)

> **Note**: Write modern ES6+ code freely — Babel transpiles it to ES5 for IE11 compatibility during the build process.

- **Use modern syntax**: Arrow functions, template literals, destructuring, `const`/`let` are all encouraged
- **Prefer `const`**: Use `const` by default, `let` when reassignment is needed, avoid `var`
- **Arrow functions**: Use arrow functions for callbacks and short functions
- **Template literals**: Use template strings for string interpolation
- **Destructuring**: Use destructuring for cleaner object/array access

### Formatting Standards
- **Tabs for indentation**: Each tab represents 2 visual spaces
- **Don't cuddle else**: Put `else` on its own line, not after `}`
- **Variable declarations**: Group related declarations together

### Object Orientation
- **Class syntax**: Use ES6 `class` syntax for new code
- **Legacy code pattern**: Existing code uses `var self = this` and `makeSubclass` — maintain consistency when modifying existing files
- **Superclass access**: Use `super` in ES6 classes, or `self.super` in legacy code

### Argument Handling
- **Default parameters**: Use ES6 default parameters where appropriate
- **Check arguments first**: Validate required arguments at the start of functions
- **Rest parameters**: Use `...args` instead of `Array.prototype.slice.call(arguments)`

### Logging & Error Handling
- **No direct `console` usage**: Use `log` for normal messages, `debug` for debugging, `logAsync()` for async operations
- **Exceptions for unrecoverable errors**: Use `throw new Error('...')` liberally
- **`log.error()` for recoverable errors**: When handling something wrong but continuing
- **`log.warn()` for non-breaking issues**: Wrong but won't break anything

## Accessibility (ARIA Labeling)

### 🎯 Interactive Elements
- **All interactive elements** (buttons, links, forms, dialogs) must include appropriate ARIA roles and labels
- **Use ARIA attributes**: Implement aria-label, aria-labelledby, and aria-describedby to provide clear, descriptive information for screen readers
- **Semantic HTML**: Use semantic HTML wherever possible to enhance accessibility

### 📢 Dynamic Content
- **Announce updates**: Ensure all dynamic content updates (modals, alerts, notifications) are announced to assistive technologies using aria-live regions
- **Maintain tab order**: Maintain logical tab order and keyboard navigation for all features
- **Visible focus**: Provide visible focus indicators for all interactive elements

## Internationalization (I18N)

### 🌍 Text and Language Support
- **Externalize text**: All user-facing text must be externalized for translation
- **Multiple languages**: Support multiple languages, including right-to-left (RTL) languages such as Arabic and Hebrew
- **Language selector**: Provide a language selector for users to choose their preferred language

### 🕐 Localization
- **Format localization**: Ensure date, time, number, and currency formats are localized based on user settings
- **UI compatibility**: Test UI layouts for text expansion and RTL compatibility
- **Unicode support**: Use Unicode throughout to support international character sets

### 📁 DataVis Language Pack System
- **Translation labels**: Use labels like `GRID.COLCONFIG_WIN.MOVE_COL_TO_TOP` for all UI text
- **Language files**: Located in `src/lang/` as JS files named by RFC 5646 codes (e.g., `en-US.js`)
- **TSV source**: Translations sourced from `en-US.tsv` (root) and `trans.tsv` (multi-language)
- **Placeholder support**: Use `%s` for inserting dynamic values (e.g., "Showing %s of %s records")
- **Add translations to `en-US.tsv`**: Columns are: label, English text, translator notes

## Documentation Preferences

### Diagrams and Visual Documentation
- **Always use Mermaid diagrams** instead of ASCII art for workflow diagrams, architecture diagrams, and flowcharts
- **Use memorable names** instead of single letters in diagrams (e.g., `Engine`, `Auth`, `Server` instead of `A`, `B`, `C`)
- Use appropriate Mermaid diagram types:
  - `graph TB` or `graph LR` for workflow architectures 
  - `flowchart TD` for process flows
  - `sequenceDiagram` for API interactions
  - `gitgraph` for branch/release strategies
- Include styling with `classDef` for better visual hierarchy
- Add descriptive comments and emojis sparingly for clarity

### Documentation Standards
- Keep documentation DRY (Don't Repeat Yourself) - reference other docs instead of duplicating
- Use clear cross-references between related documentation files
- Update the main architecture document when workflow structure changes

## Working with GitHub Actions Workflows

### Development Philosophy
- **Script-first approach**: All workflows should call scripts that can be run locally
- **Local development parity**: Developers should be able to run the exact same commands locally as CI runs
- **Simple workflows**: GitHub Actions should be thin wrappers around scripts, not contain complex logic
- **Easy debugging**: When CI fails, developers can reproduce the issue locally by running the same script

## DataVis Build & Test Commands

Use GNU Make for all build operations:

- `make setup` — Install all dependencies (Node & Python via pyenv)
- `make datavis` — Build compressed JS and CSS files to `dist/`
- `make tests` — Build and copy to tests directory, generate test data
- `make test` — Run automated tests using Mocha & Selenium
- `make doc` — Build all documentation (jsdoc + mkdocs)
- `make clean` — Remove build products and generated test data
- `make teardown` — Reset development environment (run when switching branches)

## Branch Management

- **`master`**: Development branch, will become next major release
- **`v3.x`** (e.g., `v3.0`, `v3.1`): Stable release branches, bug fixes only
- **`feature/*`**: Active development for breaking changes
- **Bug fixes**: Commit to every stable branch that needs it, merge latest stable into `master`
- **New features**: Create new minor branch off latest stable (e.g., `v3.3` from `v3.2`)
- **Always run** `make teardown && make setup` when switching branches

## Quick Reference

### 🪶 All Changes should be considered for Pull Request Philosophy

* **Smallest viable change**: Always make the smallest change that fully solves the problem.
* **Fewest files first**: Start with the minimal number of files required.
* **No sweeping edits**: Broad refactors or multi-module changes must be split or proposed as new components.
* **Isolated improvements**: If a change grows complex, extract it into a new function, module, or component instead of modifying multiple areas.
* **Direct requests only**: Large refactors or architectural shifts should only occur when explicitly requested.

### Code Quality Checklist
- [ ] **DRY**: No code duplication - extracted reusable functions?
- [ ] **KISS**: Simplest solution that works?
- [ ] **Minimal Changes**: Smallest viable change made for PR?
- [ ] **Naming**: Self-documenting function/variable names?
- [ ] **Size**: Functions small and focused?
- [ ] **Dead Code**: Removed or archived appropriately?
- [ ] **Accessibility**: ARIA labels and semantic HTML implemented?
- [ ] **I18N**: User-facing text externalized for translation?
- [ ] **Modern JS**: Using ES6+ syntax (const/let, arrow functions, template literals)?
- [ ] **Consistency**: Matches style of surrounding code in existing files?
- [ ] **Lint**: Run `npm run lint`
- [ ] **Test**: Run `make test`