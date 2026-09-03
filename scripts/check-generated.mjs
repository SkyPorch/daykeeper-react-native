// Provenance guard for the vendored customer contract.
//
// `git diff --exit-code` alone only proved the generated types matched the
// YAML in the tree. It could not tell whether that YAML was still the file we
// reviewed, so an edit to openapi/customer.yaml plus a regenerate looked
// clean. Recompute the contract's SHA-256 and its Git blob id, pin both here,
// and require the upstream commit and both digests to appear in
// openapi/SOURCE.md, so the vendored bytes and the recorded provenance cannot
// drift apart without this failing. Regeneration is verified into a temporary
// directory so the check never depends on a clean working tree.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const EXPECTED_COMMIT = "4a2b82c9b23503073dc26fdeb5163e8869d007b8";
const EXPECTED_SHA256 =
  "ae75711072950c786d69401301292659ece7f37461cf0621ae4f8a58836b82bd";
const EXPECTED_BLOB = "9cdf5423e73ad8008fc62adeb8c66e3c018c357d";

const root = fileURLToPath(new URL("../", import.meta.url));
const contract = await readFile(join(root, "openapi/customer.yaml"));
const source = await readFile(join(root, "openapi/SOURCE.md"), "utf8");

const checksum = createHash("sha256").update(contract).digest("hex");
assert.equal(
  checksum,
  EXPECTED_SHA256,
  "openapi/customer.yaml does not match the reviewed contract snapshot",
);
assert(source.includes(checksum), "openapi/SOURCE.md omits the SHA-256");

const blob = createHash("sha1")
  .update(`blob ${contract.length}\0`)
  .update(contract)
  .digest("hex");
assert.equal(blob, EXPECTED_BLOB, "The contract Git blob id changed");
assert(source.includes(blob), "openapi/SOURCE.md omits the Git blob id");
assert(
  source.includes(EXPECTED_COMMIT),
  "openapi/SOURCE.md omits the upstream commit",
);
// A plain assert, not assert.match: a failure here must not print the whole
// contract into CI output.
assert(
  contract.toString().includes("identifier: Apache-2.0"),
  "The vendored contract license identifier changed",
);

await mkdir(join(root, ".smoke"), { recursive: true });
const directory = await mkdtemp(join(root, ".smoke/generated-"));
const target = join(directory, "schema.ts");
await promisify(execFile)(
  join(root, "node_modules/.bin/openapi-typescript"),
  ["openapi/customer.yaml", "--output", target],
  { cwd: root, timeout: 60_000 },
);
assert(
  (await readFile(target)).equals(
    await readFile(join(root, "src/generated/schema.ts")),
  ),
  "Generated types differ; run pnpm generate and review the contract change",
);

console.log(
  `Customer contract checksum, Git blob, provenance and regeneration verified: ${checksum}`,
);
