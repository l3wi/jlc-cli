# @jlcpcb/mcp

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

### Patch Changes

- Updated dependencies []:
  - @jlcpcb/core@0.3.0

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

### Patch Changes

- Updated dependencies [cd6df88]
  - @jlcpcb/core@0.2.0

## 0.1.1

### Patch Changes

- **@jlcpcb/core:**
  - Fix: Restrict built-in footprints to 2-pad passives only — prevents pin-flip issues on multi-pin components

  **@jlcpcb/cli & @jlcpcb/mcp:**
  - Updated dependencies

- Updated dependencies []:
  - @jlcpcb/core@0.1.1

## 0.1.0

### Minor Changes

- [`cc44735`](https://github.com/l3wi/jlc-cli/commit/cc44735cc56191533f1a088101dfe2b368929048) Thanks [@l3wi](https://github.com/l3wi)! - Initial release of @jlcpcb packages for JLC/EasyEDA component sourcing and KiCad integration.
  - **@jlcpcb/core**: Core library with API clients, converters, and services
  - **@jlcpcb/cli**: Interactive terminal UI for component search and library management
  - **@jlcpcb/mcp**: MCP server for Claude Desktop/Code integration

### Patch Changes

- Updated dependencies [[`cc44735`](https://github.com/l3wi/jlc-cli/commit/cc44735cc56191533f1a088101dfe2b368929048)]:
  - @jlcpcb/core@0.1.0
