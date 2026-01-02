/**
 * KiCad utilities
 * Shared functions for detecting KiCad installation and paths
 */

import { existsSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';
import { KICAD_VERSIONS, type KiCadVersion } from '../constants/kicad.js';

/**
 * Detect the installed KiCad version by checking for version directories.
 * Returns the newest found version, or '9.0' as default.
 */
export function detectKicadVersion(): KiCadVersion {
  const home = homedir();
  const baseDir = join(home, 'Documents', 'KiCad');

  for (const version of KICAD_VERSIONS) {
    if (existsSync(join(baseDir, version))) {
      return version;
    }
  }
  return '9.0';
}

/**
 * Get the KiCad configuration directory for a specific version.
 * @param version - KiCad version (e.g., '9.0', '8.0'). If not specified, auto-detects.
 */
export function getKicadConfigDir(version?: KiCadVersion): string {
  const v = version ?? detectKicadVersion();
  const home = homedir();
  const plat = platform();

  if (plat === 'linux') {
    return join(home, '.local', 'share', 'kicad', v);
  }
  return join(home, 'Documents', 'KiCad', v);
}

/**
 * Get the path to sym-lib-table for a KiCad version.
 */
export function getSymLibTablePath(version?: KiCadVersion): string {
  return join(getKicadConfigDir(version), 'sym-lib-table');
}

/**
 * Get the path to fp-lib-table for a KiCad version.
 */
export function getFpLibTablePath(version?: KiCadVersion): string {
  return join(getKicadConfigDir(version), 'fp-lib-table');
}
