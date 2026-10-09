// Source of the four app-icon designs (src/icons/design-a.svg ... design-d.svg; A is in use).
//   node scripts/icon_designs.js     # writes the four SVGs, and build/icon-designs.html to compare them
//                                    # (as is, cut to a circle like Android, and at home-screen size)
// Edit a design here, run this, then `npm run icons` (scripts/make_icons.js) to render the PNGs from design A
// (or `node scripts/make_icons.js b` for another one). Each design is a full-bleed 512 x 512 square with what
// matters inside the central 80 % (the maskable safe zone).
const fs = require("fs"), path = require("path");
const ICONS = path.join(__dirname, "..", "src", "icons"), BUILD = path.join(__dirname, "..", "build");
const D = {
A: `<rect width="512" height="512" fill="#1f5fa8"/>
<g fill="none" stroke="#fff" stroke-opacity=".9"><circle cx="256" cy="256" r="72" stroke-width="14"/><circle cx="256" cy="256" r="128" stroke-width="10" stroke-dasharray="34 20"/><circle cx="256" cy="256" r="178" stroke-width="8" stroke-dasharray="6 16" stroke-linecap="round"/></g>
<circle cx="256" cy="256" r="34" fill="#c2410c" stroke="#fff" stroke-width="12"/>`,
B: `<rect width="512" height="512" fill="#f4f1ea"/>
<g stroke="#d9534f" stroke-width="7" fill="none" stroke-linejoin="round"><path d="M0 150 140 190 210 60 200 -10M140 190 120 330 0 360M120 330 260 400 300 520M260 400 380 300 512 330M380 300 330 170 400 40 420 -10M330 170 210 60M330 170 512 150"/></g>
<path d="M140 190 210 60 330 170 380 300 260 400 120 330Z" fill="#1f5fa8" fill-opacity=".85"/>
<circle cx="245" cy="245" r="30" fill="#c2410c" stroke="#fff" stroke-width="11"/>
<g fill="#c2410c" stroke="#fff" stroke-width="7"><circle cx="80" cy="260" r="17"/><circle cx="440" cy="220" r="17"/><circle cx="330" cy="470" r="17"/><circle cx="300" cy="40" r="17"/></g>`,
C: `<defs><radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#21406e"/><stop offset="1" stop-color="#0f1f38"/></radialGradient>
<linearGradient id="sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4fd1a5" stop-opacity="0"/><stop offset="1" stop-color="#4fd1a5" stop-opacity=".75"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<g fill="none" stroke="#4fd1a5" stroke-opacity=".55" stroke-width="6"><circle cx="256" cy="256" r="90"/><circle cx="256" cy="256" r="180"/><path d="M256 76V436M76 256H436"/></g>
<path d="M256 256 L256 76 A180 180 0 0 1 411.9 166 Z" fill="url(#sw)"/>
<g stroke="#fff" stroke-width="7"><circle cx="330" cy="150" r="20" fill="#f59e0b"/><circle cx="170" cy="330" r="16" fill="#e2e8f0"/><circle cx="340" cy="330" r="16" fill="#e2e8f0"/><circle cx="160" cy="180" r="16" fill="#e2e8f0"/></g>
<circle cx="256" cy="256" r="14" fill="#4fd1a5"/>`,
D: `<rect width="512" height="512" fill="#fff"/>
<g fill="#1f5fa8"><circle cx="256" cy="256" r="190" fill-opacity=".12"/><circle cx="256" cy="256" r="130" fill-opacity=".18"/></g>
<g fill="none" stroke="#1f5fa8" stroke-width="9"><circle cx="256" cy="256" r="190"/><circle cx="256" cy="256" r="130" stroke-dasharray="30 18"/></g>
<g font-family="BIZ UDPGothic" font-weight="700" font-size="44" text-anchor="middle" dominant-baseline="central" fill="#fff">
<circle cx="190" cy="170" r="34" fill="#1f5fa8"/><text x="190" y="172">1</text>
<circle cx="340" cy="210" r="34" fill="#0f8f7e"/><text x="340" y="212">2</text>
<circle cx="230" cy="350" r="34" fill="#d97706"/><text x="230" y="352">3</text></g>
<circle cx="256" cy="256" r="26" fill="#c2410c" stroke="#fff" stroke-width="10"/>`,
};
const name = { A: "A レーダーの同心円（青地）", B: "B ボロノイの範囲（地図風）", C: "C レーダー画面（濃紺）", D: "D 順位の番号（白地）" };
let html = `<!doctype html><meta charset=utf-8><link rel=stylesheet href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap"><style>
body{margin:0;padding:16px;font-family:"BIZ UDPGothic";background:#e9e6df}
.row{display:flex;align-items:center;gap:22px;margin-bottom:18px;background:#fff;border-radius:10px;padding:12px 16px}
.t{width:220px;font-weight:700;font-size:15px}.sq svg{width:150px;height:150px;border-radius:14px;display:block}
.ci svg{width:110px;height:110px;border-radius:50%;display:block}.sm{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px}
.sm svg{width:48px;height:48px;border-radius:50%;display:block}.home{background:#3b4a5e;padding:10px 14px;border-radius:10px;color:#fff}
.lab{font-size:11px;color:#666;text-align:center;margin-top:4px}</style>`;
for (const k of "ABCD") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${D[k]}</svg>`;
  fs.writeFileSync(path.join(ICONS, `design-${k.toLowerCase()}.svg`), svg);
  html += `<div class=row><div class=t>${name[k]}</div><div><div class=sq>${svg}</div><div class=lab>元の形</div></div><div><div class=ci>${svg}</div><div class=lab>丸く切り抜き</div></div><div class="home sm">${svg}<span>駅レーダー</span></div></div>`;
}
fs.mkdirSync(BUILD, { recursive: true });
fs.writeFileSync(path.join(BUILD, "icon-designs.html"), html);
console.log("src/icons/design-a.svg ... design-d.svg, build/icon-designs.html");
