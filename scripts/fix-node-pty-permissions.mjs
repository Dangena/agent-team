import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

if (process.platform !== "win32") {
  const require = createRequire(new URL("../packages/agent-host/package.json", import.meta.url));
  const packageRoot = dirname(require.resolve("node-pty/package.json"));
  const helper = join(packageRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");
  if (existsSync(helper)) chmodSync(helper, 0o755);
}
