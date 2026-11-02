# Validation status

- Source archive unpacked and 148 tracked project files reviewed for packaging.
- `npm ci --no-audit --no-fund`: attempted, but timed out in this execution environment; dependencies were not installed.
- `npm test`, `npm run typecheck`, `npm run build`, and Playwright: **not executed** because dependencies were unavailable.
- No automated test has been reported as passing.
- Run `npm ci && npm run db:generate && npm run typecheck && npm test && npm run build` in CI before release.
- Never test real government SMS filing with demo data.
