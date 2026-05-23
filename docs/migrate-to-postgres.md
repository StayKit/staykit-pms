# Migrating SQLite → Postgres

SQLite is production-fit for a single owner with low write concurrency. Migrate when you cross
~25 properties, need sustained writes > 10/sec, or want read replicas.

The migration is mechanical:

1. Change the datasource in `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL` to your Postgres connection string.
3. `npx prisma migrate dev --name init` (or `db push`) against the new database.
4. Move data with `pgloader`, a custom ETL, or by exporting/importing per table.

What translates cleanly:

- The **`BookingRoom @@unique([roomId, date])`** double-booking constraint works identically.
- The **`Job`** table locking pattern (claim via transactional `SELECT … UPDATE`) is portable; on
  Postgres you can additionally use `SELECT … FOR UPDATE SKIP LOCKED`.
- `connection_limit=1` is no longer needed — raise the pool and drop the SQLite-only PRAGMAs.

Consider true **row-level security** policies on Postgres in place of the application-level
`ownerId` tenancy filter once multiple unrelated owners share a deployment.
