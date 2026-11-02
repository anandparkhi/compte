import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { migrate } from "../scripts/db-migrate";

// Each test file gets its own fresh SQLite database with all migrations (incl. triggers) applied.
const file = path.join(os.tmpdir(), `compte-test-${process.pid}-${randomUUID()}.db`);
migrate(file, { reset: true, quiet: true });
process.env.DATABASE_URL = `file:${file}`;
process.env.DEMO_MODE = "true";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SARVAM_API_KEY;
delete process.env.RESEND_API_KEY;
