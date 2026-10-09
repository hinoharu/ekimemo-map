// Sanity check of the built page: placeholders replaced and every inline script parses.
const fs = require("fs"), path = require("path"), vm = require("vm");
const html = fs.readFileSync(path.join(__dirname, "..", "dist", "index.html"), "utf8");
let errors = 0;
for (const ph of ["/*CORE*/", "/*DATA*/", "/*VERSION*/"]) if (html.includes(ph)) { console.error(`placeholder ${ph} left in dist/index.html`); errors++; }
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((code, i) => {
  try { new vm.Script(code, { filename: `inline-script-${i}.js` }); }
  catch (e) { console.error(`script ${i}: ${e.message}`); errors++; }
});
// railway lines published next to the page (fetched by it when the lines are shown)
try {
  const lines = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dist", "lines.json"), "utf8")).lines;
  if (!Array.isArray(lines) || lines.length < 100) throw new Error(`only ${lines && lines.length} lines`);
  const bad = lines.filter(l => !Array.isArray(l[3]) || l[3].some(seg => seg.length < 4 || seg.length % 2));
  if (bad.length) throw new Error(`${bad.length} lines with malformed segments`);
} catch (e) { console.error(`dist/lines.json: ${e.message}`); errors++; }
// service worker: built, placeholder replaced, parses
try {
  const sw = fs.readFileSync(path.join(__dirname, "..", "dist", "sw.js"), "utf8");
  if (sw.includes("/*BUILD*/")) throw new Error("placeholder /*BUILD*/ left");
  new vm.Script(sw, { filename: "sw.js" });
} catch (e) { console.error(`dist/sw.js: ${e.message}`); errors++; }
// installable web app: the manifest parses, is linked from the page and its icons exist with the stated sizes
try {
  const dist = path.join(__dirname, "..", "dist");
  const m = JSON.parse(fs.readFileSync(path.join(dist, "manifest.webmanifest"), "utf8"));
  if (!html.includes('rel="manifest" href="manifest.webmanifest"')) throw new Error("not linked from index.html");
  for (const k of ["name", "short_name", "start_url", "display"]) if (!m[k]) throw new Error(`no ${k}`);
  const sizes = new Set();
  for (const ic of m.icons || []) {
    const png = fs.readFileSync(path.join(dist, ic.src)); // PNG: width / height at bytes 16..23
    const wh = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
    if (wh !== ic.sizes) throw new Error(`${ic.src} is ${wh}, manifest says ${ic.sizes}`);
    sizes.add(ic.sizes + "/" + (ic.purpose || "any"));
  }
  for (const need of ["192x192/any", "512x512/any", "512x512/maskable"]) if (!sizes.has(need)) throw new Error(`no ${need} icon`);
  fs.readFileSync(path.join(dist, "icons", "apple-touch-icon.png"));
} catch (e) { console.error(`dist/manifest.webmanifest: ${e.message}`); errors++; }
if (errors) process.exit(1);
console.log(`dist/index.html ok (${scripts.length} inline scripts, ${(html.length / 1024).toFixed(0)} KiB), dist/lines.json ok, dist/sw.js ok, manifest and icons ok`);
