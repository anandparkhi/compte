import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log("[compte] Database migrations are managed separately outside Vercel production.");
  process.exit(0);
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error("[compte] Production migration halted: set DIRECT_URL (or DATABASE_URL) to a direct PostgreSQL connection.");
  process.exit(1);
}
// Only run on the database attached to this deployment. Never print credentials.
const prismaCli = join(process.cwd(), "node_modules", "prisma", "build", "index.js");
if (!existsSync(prismaCli)) {
  console.error("[compte] Prisma CLI not installed; cannot safely deploy production migrations.");
  process.exit(1);
}
console.log("[compte] Applying pending PostgreSQL migrations before production build.");
const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  stdio: "inherit", env: process.env
});
if (result.error || result.status !== 0) {
  console.error("[compte] Production database migration failed. Deployment must not continue.");
  process.exit(1);
}
console.log("[compte] Production migrations applied.");
