# @jlcpcb/core

## 0.5.0

### Minor Changes

- Add JLCPCB catalogue browsing and attribute filtering to the core service: `getComponentTypes()` (typed
  component-type tree), `getFilterAttributes()` (per-type vocabulary, counts, brands, packages), catalogue
  filters on search (`typeIds`, `attributeFilters`, `brands`, `packages`), `searchPage()` with the API row
  count for pagination, and `resolveAttributeQuery()` to turn bounds such as "Output Current >= 1A" into the
  exact facet values the API accepts using its own unit metadata.

### Patch Changes

- Report JLCPCB PCBA service compatibility from `componentProductType` as `pcbaType` on search results, exposing "Standard Only" parts that cannot use Economic PCBA; add `economicOnly` to search options to exclude them.
- Correct browser capsule/custom-pad geometry, rotation and drill offsets, roundrect radii, arc sweeps/bounds, visible annotations, and rule-area display.
- Preserve complete symbol paths, unequal ellipses, separate contours, and source fills; position visible properties with source geometry and reject unrepresentable compound fills.
- Repair symbol pin validation units, direction conventions, identities, names, and electrical semantics; reject unknown evidence and disclose unvalidated graphics scope.
- Preserve custom-pad copper boundaries, rotated/offset slots, NPTH semantics, complete courtyards, and repeated/relative SVG curve geometry.
- Reject missing or contradictory drill dimensions and unsupported cutout semantics instead of inventing drills or filling excluded copper.
- Restrict nominal KiCad substitution to recognized compatible R/C/L packages, accept reference-designator placeholders, and retain source pad identities.
- Validate manufacturing geometry, layers, plating, holes, and vias without permissive false passes; verify live fixture part/package identities.

- Preserve unrelated symbols and shared footprints during removal; use exact, quote-aware top-level symbol identities for replacement.
- Preserve diode polarity and passive pad identifiers, calculate SVG arc geometry correctly, and extract capacitor values from capacitance units.
- Return qualified installed symbol references and register project libraries under matching category names.
- Resolve project-local 3D models through `KIPRJMOD` and use the detected KiCad version for global library variables.
- Remove executable query injection from the component browser and share library path and symbol-range utilities across consumers.

## 0.4.0

### Minor Changes

- Improve agent-facing CLI and MCP contracts.
  - Add clean JSON output modes for CLI search, info, install, EasyEDA, library, and validation commands.
  - Add direct non-interactive install flows with `--yes` while keeping `--force` scoped to reinstall behavior.
  - Use discriminated component result IDs for LCSC and EasyEDA community parts.
  - Return structured MCP errors and explicit partial-success statuses.
  - Harden EasyEDA HTTP fallback execution and validate component IDs before URL construction.
  - Avoid artifact writes during no-op installs when a symbol already exists.

## 0.3.1

### Patch Changes

- d5a74c2: Fix EasyEDA 3D model transform import so KiCad footprints preserve model offsets and rotations.

  Improve CLI table formatting so search and library rows keep aligned columns, including with wide characters.

  Add workspace lint scripts and ESLint configuration so `bun run lint` works across packages.

## 0.3.0

### Minor Changes

- 0.3.0

  Minor Changes

  CLI:
  - Add component delete functionality with D shortcut in component view
  - Add O shortcut to open datasheet (replaces D)
  - Add library regenerate command to regenerate all installed components
  - Add validation suite for footprint/symbol comparison (jlc validate)
  - Enable 3D models by default during installation
  - Remove non-functional S/F/M shortcuts from component view

  Core:
  - Add symbol text parsing and rendering for connector components
  - Add arc interpolation for SOLIDREGION polygon paths (improves complex footprint accuracy)
  - Add remove() method to library service for deleting components

  Patch Changes

  Core:
  - Strip temperature prefix from component descriptions
  - Improve hole detection and polygon pad handling in footprint converter

  CLI:
  - Fix async handling in renderApp exit
  - Simplify loading indicators

  MCP:
  - Fix typecheck errors in batch and library tools
  - Correct validationData property paths
  - Fix InstalledComponent property access

  Validator:
  - Align SVG reference extraction with KiCad converter

## 0.2.0

### Minor Changes

- cd6df88: Packages to select: @jlcpcb/cli (minor), @jlcpcb/core (minor)

  Summary to paste:

  Add `jlc easyeda install [uuid]` command for EasyEDA community components

  CLI changes:
  - New `jlc easyeda install [uuid]` subcommand with -p/--project, --with-3d, -f/--force options
  - Dedicated EasyEDAInfoScreen and EasyEDADetailView showing community-specific fields
  - Installation status detection: shows "R Regenerate" if installed, "Enter Install" if not
  - "✓ Installed" indicator next to component title when already in library
  - `jlc install` now rejects non-LCSC IDs with helpful redirect to `jlc easyeda install`

  Core changes:
  - Add `isEasyEDAInstalled()` method to check if component exists in EasyEDA library
  - Register EasyEDA library in global KiCad tables with portable ${KICAD9_3RD_PARTY} paths
  - Support global installation for community components (no projectPath required)
  - Separate library names (EasyEDA vs EasyEDA-local) to avoid global/local collision

## 0.1.1

### Patch Changes

- **@jlcpcb/core:**
  - Fix: Restrict built-in footprints to 2-pad passives only — prevents pin-flip issues on multi-pin components

  **@jlcpcb/cli & @jlcpcb/mcp:**
  - Updated dependencies

## 0.1.0

### Minor Changes

- [`cc44735`](https://github.com/l3wi/jlc-cli/commit/cc44735cc56191533f1a088101dfe2b368929048) Thanks [@l3wi](https://github.com/l3wi)! - Initial release of @jlcpcb packages for JLC/EasyEDA component sourcing and KiCad integration.
  - **@jlcpcb/core**: Core library with API clients, converters, and services
  - **@jlcpcb/cli**: Interactive terminal UI for component search and library management
  - **@jlcpcb/mcp**: MCP server for Claude Desktop/Code integration
