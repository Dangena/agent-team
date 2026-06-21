import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const prototype = join(root, "apps", "desktop", "prototype", "index.html");

console.log("Zero-install development mode");
console.log(`Open this local prototype in a browser: ${prototype}`);
console.log("No npm dependencies are installed or required for this mode.");
