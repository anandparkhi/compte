// Starts a production server on a fresh, seeded E2E database. Used by playwright.config.ts.
import { execSync, spawn } from "node:child_process";
const env = { ...process.env, DATABASE_URL: "file:./prisma/e2e.db", DEMO_MODE: "true", ALLOW_DEMO_IN_PRODUCTION: "true", PORT: "3100" };
delete env.ANTHROPIC_API_KEY; delete env.SARVAM_API_KEY; delete env.RESEND_API_KEY;
execSync("npx tsx scripts/db-migrate.ts --reset", { env, stdio: "inherit" });
execSync("npx tsx --conditions=react-server prisma/seed.ts", { env, stdio: "inherit" });
const p = spawn("npx", ["next", "start", "-p", "3100"], { env, stdio: "inherit" });
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { p.kill(s); process.exit(0); });
