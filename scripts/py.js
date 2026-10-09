// Run a Python script with whichever interpreter exists (python3 / python / py -3).
// Lets `npm run build` work the same on Windows, macOS and Linux.
const { spawnSync } = require("child_process");
const candidates = process.platform === "win32"
  ? [["py", ["-3"]], ["python", []], ["python3", []]]
  : [["python3", []], ["python", []]];
for (const [cmd, pre] of candidates) {
  const probe = spawnSync(cmd, [...pre, "--version"], { encoding: "utf8" });
  if (probe.status === 0 && /Python 3/.test((probe.stdout || "") + (probe.stderr || ""))) {
    const r = spawnSync(cmd, [...pre, ...process.argv.slice(2)], { stdio: "inherit" });
    process.exit(r.status ?? 1);
  }
}
console.error("Python 3 が見つかりません。https://www.python.org/ からインストールしてください。");
process.exit(1);
