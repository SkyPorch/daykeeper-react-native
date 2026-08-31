import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
async function testFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await testFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".test.ts"))
      files.push(path);
  }
  return files.sort();
}
// Node 20 does not expand the quoted --test glob accepted by newer Node.
// Enumerate explicitly so every supported version runs the same full suite.
const files = await testFiles(join(root, "test"));
if (!files.length) throw new Error("No SDK tests found");
const child = spawn(process.execPath, ["--import", "tsx", "--test", ...files], {
  cwd: root,
  stdio: "inherit",
});
child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
