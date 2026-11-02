import fs from "node:fs";
import path from "node:path";

const route = path.join(".next", "server", "app", "api", "invoices", "[id]", "pdf", "route.js.nft.json");
if (!fs.existsSync(route)) {
  console.error("PDF route trace missing:", route);
  process.exit(1);
}
const trace = JSON.parse(fs.readFileSync(route, "utf8"));
for (const name of ["NotoSansDevanagari_400Regular.ttf", "NotoSansDevanagari_700Bold.ttf"]) {
  if (!(trace.files ?? []).some(file => file.endsWith(name))) {
    console.error("PDF font not included in traced serverless bundle:", name);
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log("Invoice PDF fonts included in serverless route trace.");
