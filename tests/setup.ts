// Integration tests use a dedicated PostgreSQL database instead of the removed SQLite runner.
// Never fall back to DATABASE_URL: that might point at a production database.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/^postgres(ql)?:\/\//.test(testUrl)) {
  throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL database before running tests");
}
process.env.DATABASE_URL = testUrl;
process.env.DEMO_MODE = "true";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SARVAM_API_KEY;
delete process.env.RESEND_API_KEY;
