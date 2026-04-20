import { readFile } from "node:fs/promises";

import { describe, expect, it } from "bun:test";

type PackageJson = {
  dependencies?: Record<string, string>;
};

async function readPackageJson(): Promise<PackageJson> {
  const packageJsonPath = new URL("../package.json", import.meta.url);
  const packageJson = await readFile(packageJsonPath, "utf8");
  return JSON.parse(packageJson) as PackageJson;
}

describe("package metadata", () => {
  it("does not publish workspace protocol runtime dependencies", async () => {
    const packageJson = await readPackageJson();
    const workspaceDependencies = Object.entries(packageJson.dependencies ?? {})
      .filter(([, version]) => version.startsWith("workspace:"))
      .map(([name]) => name);

    expect(workspaceDependencies).toEqual([]);
    expect(packageJson.dependencies?.["@jlcpcb/core"]).toBeUndefined();
  });
});
