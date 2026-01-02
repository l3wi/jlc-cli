---
"@jlcpcb/cli": minor
"@jlcpcb/core": minor
"@jlcpcb/mcp": minor
---

Packages to select: @jlcpcb/cli (minor), @jlcpcb/core (minor)

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
