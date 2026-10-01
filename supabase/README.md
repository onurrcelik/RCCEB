# Supabase SQL

`schema.sql` is the complete schema. Run it once, by hand, in the Supabase SQL editor of
a fresh project. It is idempotent, so re-running it is safe.

When the schema changes later, add a dated file next to it (for example
`2026-11-01-add-x.sql`) containing only the `ALTER`s, and update `schema.sql` to match.
That way a fresh project still needs only the one file.

Every table enables RLS and has no anon or authenticated policies. The app only touches
the database from server code, which bypasses RLS, so don't add broad policies.
