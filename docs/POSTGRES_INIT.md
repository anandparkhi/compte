# Initialize the connected PostgreSQL database

The login error `The table public.User does not exist` means the versioned database migrations have not yet been applied to the database Vercel uses.

Use the manual GitHub Actions workflow **Initialize Compte PostgreSQL database**. It intentionally does **not** run on pushes or deploys.

1. In the repository GitHub Settings > Environments create an environment named `database-migration`. Add an environment secret named `COMPTE_DATABASE_URL` with the **direct** PostgreSQL connection URL for the **same database as the Vercel Compte production deployment**. Never commit the secret or share it in chat.
2. For production, configure required reviewers on the environment if your GitHub plan supports them.
3. In GitHub Actions, choose **Initialize Compte PostgreSQL database**, select the `main` branch, and click **Run workflow**.
4. The workflow checks the URL, installs dependencies, checks migration status, applies `prisma migrate deploy`, then verifies migration status.
5. Reload the Compte website and use **Create an account** after the workflow succeeds.

This workflow does not seed the public demo account. Do not run `prisma migrate reset` or `prisma db push --force-reset` against production. If the migration reports errors or the database already has tables, inspect the schema before proceeding. The connection must target the same database/schema used by Vercel, or login will continue to fail.
