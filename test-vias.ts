import { fetchComponent } from "./packages/core/src/api/easyeda.js";
import { parseFootprint } from "./packages/core/src/parsers/easyeda-shapes.js";
import { EasyEDAFootprintConverter } from "./packages/core/src/converter/footprint.js";

const uuid = "379535eebaec4c08b9ff61ebb5579beb";
const data = await fetchComponent(uuid);
const fp = parseFootprint(data.packageDetail.dataStr);
console.log("VIAs found:", fp.vias.length);
if (fp.vias.length > 0) {
  console.log("First VIA:", JSON.stringify(fp.vias[0], null, 2));
}
console.log("\n--- Generated KiCad output (vias section) ---");
const converter = new EasyEDAFootprintConverter();
const output = converter.convert(data.packageDetail.dataStr, { footprintName: "test" });
const lines = output.split("\n");
const viaLines = lines.filter(l => l.includes('pad ""'));
console.log("Pad with empty number count:", viaLines.length);
if (viaLines.length > 0) console.log("Sample:\n", viaLines.slice(0, 8).join("\n"));
