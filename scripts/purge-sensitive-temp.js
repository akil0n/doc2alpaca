const { rmSync } = require("node:fs");
const { join } = require("node:path");

// Older releases wrote QARecord.source evidence into this directory.
// Remove it before every production build/start; current releases never recreate it.
rmSync(join(process.cwd(), ".tmp", "extraction-sessions"), {
  recursive: true,
  force: true,
});
