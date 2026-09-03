// Verifies the published tarball is reproducible and contains only what it
// should. Packs twice, extracts both, and compares the file list plus the
// SHA-256 of every entry's contents. The tarball itself is never hashed: gzip
// embeds a timestamp, so identical inputs produce different bytes.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const FORBIDDEN = [
  /(^|\/)tests?\//,
  /(^|\/)__tests__\//,
  /(^|\/)fixtures\//,
  /(^|\/)smoke\//,
  /\.test\.[^/]+$/,
];

const run = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${command} exited ${code}: ${stderr || stdout}`)),
    );
  });

const walk = async (directory) => {
  const out = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
};

// Pack into `directory` and extract the tarball; returns path -> content hash.
const packAndExtract = async (directory) => {
  const output = await run(
    "npm",
    ["pack", "--json", "--pack-destination", directory],
    root,
  );
  const [result] = JSON.parse(output.slice(output.indexOf("[")));
  const tarball = join(directory, result.filename);
  const extracted = join(directory, "extracted");
  await mkdir(extracted, { recursive: true });
  await run("tar", ["-x", "-f", tarball, "-C", extracted], root);
  const packageRoot = join(extracted, "package");
  await stat(packageRoot);
  const files = new Map();
  for (const file of await walk(packageRoot)) {
    const name = relative(packageRoot, file).split(sep).join(posix.sep);
    files.set(
      name,
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
    );
  }
  return { files, packageRoot };
};

const failures = [];

const first = await mkdtemp(join(tmpdir(), "daykeeper-pack-a-"));
const second = await mkdtemp(join(tmpdir(), "daykeeper-pack-b-"));
try {
  const a = await packAndExtract(first);
  const b = await packAndExtract(second);

  // 1. Reproducibility: same file list, same content hashes.
  const names = new Set([...a.files.keys(), ...b.files.keys()]);
  for (const name of [...names].sort()) {
    const left = a.files.get(name);
    const rightHash = b.files.get(name);
    if (left === undefined) failures.push(`only in second pack: ${name}`);
    else if (rightHash === undefined)
      failures.push(`only in first pack: ${name}`);
    else if (left !== rightHash)
      failures.push(`content differs: ${name}\n  ${left}\n  ${rightHash}`);
  }

  // 2. No test, fixture or smoke material in the published tarball.
  for (const name of a.files.keys()) {
    if (FORBIDDEN.some((pattern) => pattern.test(name)))
      failures.push(`test or fixture path present in pack: ${name}`);
  }

  // 3. Source maps must not reference anything outside the published tree.
  for (const name of a.files.keys()) {
    if (!name.endsWith(".map")) continue;
    let map;
    try {
      map = JSON.parse(await readFile(join(a.packageRoot, name), "utf8"));
    } catch (cause) {
      failures.push(`unreadable source map ${name}: ${cause.message}`);
      continue;
    }
    for (const source of map.sources ?? []) {
      const outside =
        source.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(source) ||
        source.includes("://") ||
        posix
          .normalize(posix.join(posix.dirname(name), source))
          .startsWith("..");
      if (outside)
        failures.push(`source map ${name} escapes the package: ${source}`);
    }
  }
} finally {
  await rm(first, { recursive: true, force: true });
  await rm(second, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(
    "verify-pack failed:\n" + failures.map((f) => `  - ${f}`).join("\n"),
  );
  process.exit(1);
}
console.log("verify-pack: tarball is reproducible and clean");
