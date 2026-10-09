// Renders the app icon PNGs from an SVG design in src/icons/ (design-a.svg ... design-d.svg; a is in use;
// the SVGs themselves are written by scripts/icon_designs.js).
//   node scripts/make_icons.js [a|b|c|d]
// The designs are full-bleed 512 x 512 squares with everything that matters inside the central 80 %, so the same
// picture serves as the "maskable" icon (Android cuts it to a circle or rounded square). Needs Playwright with
// Chromium (not a dependency of the build: the PNGs are committed and the build only copies them).
// Set PLAYWRIGHT_PATH if playwright is not resolvable from here.
const fs = require("fs"), path = require("path");
const design = (process.argv[2] || "a").toLowerCase();
const dir = path.join(__dirname, "..", "src", "icons");
const svg = fs.readFileSync(path.join(dir, `design-${design}.svg`), "utf8");
let pw;
for (const p of [process.env.PLAYWRIGHT_PATH, "playwright", "/opt/node-tools/node_modules/playwright"].filter(Boolean)) {
  try { pw = require(p); break; } catch (e) {}
}
if (!pw) { console.error("playwright not found (set PLAYWRIGHT_PATH)"); process.exit(1); }
// [file, size, rounded]: "any" icons get rounded corners (transparent outside), maskable / Apple ones are full-bleed
const OUT = [["icon-192.png", 192, true], ["icon-512.png", 512, true], ["icon-maskable-512.png", 512, false], ["apple-touch-icon.png", 180, false]];
(async () => {
  const b = await pw.chromium.launch();
  for (const [file, size, rounded] of OUT) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<!doctype html><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@700&display=swap">
      <style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px;${rounded ? "border-radius:22%;" : ""}}</style>${svg}`);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(dir, file), omitBackground: true });
    await p.close();
    console.log(`src/icons/${file} (${size} px${rounded ? ", rounded" : ""})`);
  }
  await b.close();
})();
