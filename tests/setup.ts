// Test environment must use PostgreSQL; the old SQLite migration runner was removed.
process.env.DEMO_MODE = "true";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SARVAM_API_KEY;
delete process.env.RESEND_API_KEY;
