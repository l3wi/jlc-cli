import { parseFootprintShapes } from "./packages/core/src/parsers/easyeda-shapes.js";
import { footprintConverter } from "./packages/core/src/converter/footprint.js";

const uuid = "379535eebaec4c08b9ff61ebb5579beb";
const response = await fetch(`https://easyeda.com/api/components/${uuid}`);
const json = await response.json();
const dataStr = json.result.packageDetail.dataStr;
const shapes = dataStr.shape;
const fp = parseFootprintShapes(shapes);
console.log("VIAs found:", fp.vias.length);
if (fp.vias.length > 0) {
  console.log("First VIA:", JSON.stringify(fp.vias[0], null, 2));
}
console.log("\n--- Generated KiCad output (vias section) ---");
const output = footprintConverter.convert(dataStr, { footprintName: "test" });
const lines = output.split("\n");
const viaLines = lines.filter(l => l.includes('pad ""'));
console.log("Pad with empty number count:", viaLines.length);
if (viaLines.length > 0) console.log("Sample:\n", viaLines.slice(0, 8).join("\n"));
