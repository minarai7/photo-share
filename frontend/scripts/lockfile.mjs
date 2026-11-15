// Keeps package-lock.json in the shape CI's `npm ci` accepts.
//
// CI installs the npm version pinned in package.json's "packageManager"
// (.github/workflows/ci.yml), and newer npm versions reject lockfiles that
// older ones wrote (for example, missing optional dependencies of the
// WebAssembly bindings). So the lockfile is always checked and written with
// that exact npm, whatever npm this machine has:
//
//   node scripts/lockfile.mjs check   # what CI's `npm ci` will say (dry run)
//   node scripts/lockfile.mjs fix     # rewrite package-lock.json with it
//
// The pre-commit hook (.githooks/pre-commit) runs `check` whenever
// package.json or package-lock.json is staged.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const pinned = pkg.packageManager;
if (!/^npm@\d+\.\d+\.\d+$/.test(pinned ?? "")) {
    console.error(`package.json "packageManager" must pin npm, like "npm@11.19.1" (found ${pinned})`);
    process.exit(2);
}

const mode = process.argv[2];
const args = {
    check: ["ci", "--dry-run", "--ignore-scripts", "--no-audit", "--no-fund"],
    fix: ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"],
}[mode];
if (!args) {
    console.error("usage: node scripts/lockfile.mjs check|fix");
    process.exit(2);
}

const run = spawnSync("npx", ["--yes", pinned, ...args], { cwd: root, stdio: "pipe", encoding: "utf8", shell: process.platform === "win32" });
const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
if (run.status !== 0) {
    const reasons = output.split("\n").filter((l) => /Missing:|Invalid:|in sync|ERR!|error code/.test(l));
    console.error(`package-lock.json fails \`npm ci\` with ${pinned} (the version CI uses):`);
    console.error(reasons.length ? reasons.join("\n") : output);
    if (mode === "check") console.error("\nFix it with: cd frontend; npm run lockfile:fix");
    process.exit(1);
}
console.log(mode === "check" ? `package-lock.json OK for ${pinned}` : `package-lock.json written with ${pinned}`);
