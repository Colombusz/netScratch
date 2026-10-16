# Supabase setup

Cloud storage is optional. The app works locally before setup. No env file needs to be created, read, or edited.

1. Use a Supabase project you control. In Authentication, enable the email/password provider. Set the Site URL and allowed redirect URLs to the exact app address, including its path if hosted in a subdirectory. For local development the default address is `http://127.0.0.1:5173/`. Add your production HTTPS address when deploying. Configure email delivery and confirmation according to your project's settings.
2. Apply `migrations/202610160001_projects.sql` once through the Supabase SQL editor or your usual migration workflow. It creates `public.projects`, owner policies, column grants, an index, and the revision trigger inside a transaction. Existing installations should track applied migration versions rather than repeatedly pasting it.
3. Start the app and open **09 Cloud**. Enter the Supabase project URL and its public publishable key (or legacy anon key). Never use a secret or service-role key in this browser application. The connection form rejects those keys.
4. Create an account, follow the confirmation email if enabled, then sign in. Save the open plan, refresh the list, and open it. Test password recovery from the same browser, since PKCE keeps its verifier there.
5. For production acceptance, use two real accounts: each should see only its own projects. Open one project in two clients and save both; the second save must report a conflict. Test email confirmation/recovery against your configured email service and redirect allowlist.

The app does not apply a hosted migration or provision Supabase automatically. This repository's tests do not contact your cloud account. Run `npm test` for a real Postgres migration/RLS test using PGlite and `npm run test:e2e` for SDK/browser flows against controlled HTTP responses.

## Data and access

- Rows are keyed by `(owner_id, id)` so imported document IDs are isolated by account. Owner IDs reference `auth.users`; deleting an auth user cascades to their projects.
- Anonymous users have no table privileges. Authenticated users can select/delete their own rows and insert/update only permitted columns. RLS checks both existing and proposed ownership.
- The server owns `revision`, `created_at`, and `updated_at`. Updates increment the revision. Clients condition updates and deletes on the revision they reviewed. Zero matching rows means conflict/removal, not success. Creation uses insert, never upsert.
- Document checks enforce basic envelope consistency, schema version 1, matching ID/name, and a 20 MiB text limit. Application import validation handles the complete schema and references. Names are limited to 1,000 characters. Documents with networking warnings or planned shortages can still be saved.
- Cloud copies are full document snapshots. Local save/recovery, JSON export, and print reporting continue independently. Cloud saves are explicit; there is no automatic merge or background sync.
- The public URL/key and SDK session persist in browser storage. Signing out removes the cloud session and leaves local project data in place. Disconnect also removes public connection configuration. Clear site data on shared devices when local copies should be removed.

## Verification boundaries

The automated database tests emulate the Supabase `auth.users` table and `auth.uid()` in Postgres and exercise the actual migration. They verify owner isolation, anonymous denial, owner/revision tampering, invalid envelopes, cascaded user deletion, and stale revision rejection. They do not validate your project's Auth configuration, SMTP/email delivery, network availability, or deployed redirect URLs. The browser tests use the installed Supabase SDK with controlled auth/PostgREST responses; they never substitute for a live deployment check.
