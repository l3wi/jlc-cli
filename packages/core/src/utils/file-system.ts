/**
 * File system operation helpers
 */

import { readdir, readFile, writeFile, mkdir, access, stat } from 'fs/promises';
import { join, dirname, extname, basename } from 'path';

/**
 * Check if a path exists
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path is a directory
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path is a file
 */
export async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Ensure the parent directory of a file exists
 */
export async function ensureParentDir(filePath: string): Promise<void> {
  const parentDir = dirname(filePath);
  await ensureDir(parentDir);
}

/**
 * Read a JSON file and parse it
 */
export async function readJson<T = unknown>(path: string): Promise<T> {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Write an object to a JSON file
 */
export async function writeJson(path: string, data: unknown, pretty: boolean = true): Promise<void> {
  await ensureParentDir(path);
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeFile(path, content, 'utf-8');
}

/**
 * Read a text file
 */
export async function readText(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}

/**
 * Write text to a file
 */
export async function writeText(path: string, content: string): Promise<void> {
  await ensureParentDir(path);
  await writeFile(path, content, 'utf-8');
}

/**
 * Write binary data to a file
 */
export async function writeBinary(path: string, data: Buffer | Uint8Array): Promise<void> {
  await ensureParentDir(path);
  await writeFile(path, data);
}

/**
 * List files in a directory with optional filtering
 */
export async function listFiles(
  dir: string,
  options: { extensions?: string[]; recursive?: boolean } = {}
): Promise<string[]> {
  const { extensions, recursive = false } = options;
  const files: string[] = [];

  async function scanDir(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory() && recursive) {
        await scanDir(fullPath);
      } else if (entry.isFile()) {
        if (!extensions || extensions.includes(extname(entry.name))) {
          files.push(fullPath);
        }
      }
    }
  }

  await scanDir(dir);
  return files;
}

/**
 * Get the filename without extension
 */
export function getBaseName(filePath: string): string {
  return basename(filePath, extname(filePath));
}

/**
 * Copy a file
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureParentDir(dest);
  const content = await readFile(src);
  await writeFile(dest, content);
}
