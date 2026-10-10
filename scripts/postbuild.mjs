// Mark each build directory with its module format so Node and bundlers
// interpret the emitted .js and .d.ts files correctly.
import { writeFileSync } from "node:fs";
writeFileSync(new URL("../dist/esm/package.json", import.meta.url), JSON.stringify({ type: "module" }) + "\n");
writeFileSync(new URL("../dist/cjs/package.json", import.meta.url), JSON.stringify({ type: "commonjs" }) + "\n");
