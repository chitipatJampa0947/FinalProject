# Secure Admin/Feedback integration

Detection stays local and does not require Supabase or CAPTCHA. Backend functionality
is disabled unless all four **public** build values are deliberately configured:

```text
VITE_BACKEND_MODE=secure-v1
VITE_SUPABASE_URL=https://tslxclshozddleaojxwb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
VITE_TURNSTILE_SITE_KEY=YOUR_PUBLIC_SITE_KEY
```

These are placeholders, not ready-to-use configuration. Never supply service-role,
secret, database password or Turnstile secret values to Vite. Legacy anon JWT keys
are accepted only if their decoded role is anon; this is configuration screening,
not JWT authentication. The server verifies real credentials. The old
VITE_ADMIN_PASSCODE and VITE_SUPABASE_ANON_KEY are no longer read by the client.

Database migration `20261112134950_harden_reports` was applied on 12 November 2026
to the owner-authorized existing project ai-detect-db (`tslxclshozddleaojxwb`). Both
original feedback records were preserved. The active migration is in
`supabase/migrations/`; the old review draft and experiment evidence are historical.
The reviewed submit-feedback Edge Function is active and the security-integrated build is now production at https://final-project-eta-peach.vercel.app/ (deployment dpl_4buo7fcyQsdPAKenZoGjpdvgZTrt). The accepted build passed all 18 asset hashes and Edge/Chrome/Firefox inference/recovery checks before owner promotion. Real staged administrator approval and rejection were independently captured; production feedback acceptance was subsequently confirmed by the owner/server logs. Current read-only verification checks the promoted aliases, exact public assets and canonical 204 preflight without adding or deleting feedback.

Real local sign-in, allowlist revocation and normal-browser CAPTCHA submission are verified. Twelve overlapping PostgreSQL17.6 ingestion transactions accepted exactly ten and rejected two in the same minute. Earlier serialized management-tool attempts and automation-only CAPTCHA failures remain historical evidence, not unresolved production defects. Real action/hostname/expiry-specific CAPTCHA failures and natural JWT expiry were not all separately forced; retain those coverage limitations. Preserve the earlier inference-only Preview, previous production deployment and encrypted pre-migration backup.
Direct anonymous table INSERT is deliberately denied:
an anonymous visitor uses the public submit-feedback Edge Function, which verifies
Turnstile's hostname/action/single-use token and calls a service-only RPC. Reads,
status changes and deletes require a valid authenticated session and a protected
database allowlist entry. Only status is updatable by application administrators.
Signing in does not confer admin rights; user_metadata is never authorization.

Auth tokens stay in tab memory (no local/sessionStorage, no URL token detection).
Auto-refresh is enabled, request timeouts are bounded and admin fetches use no-store.
Reload requires signing in again. Use the dashboard's exit button to request global
sign-out. Failed global sign-out is surfaced, not represented as confirmed revocation.
Database authorization also checks the current allowlist and auth.sessions row.
Use short Auth token lifetimes and promptly revoke allowlist membership for incidents.
Memory storage limits persistence; it does not make an XSS-compromised tab safe.

## Administrator setup and operating procedure

1. The transaction-only correction is applied to the active formal migration:
   authored BEGIN/COMMIT were removed, with security SQL and SET LOCAL unchanged.
   Pinned Supabase CLI 2.122.1 was tested over a disposable PostgreSQL17.5 socket:
   success records schema/history together; injected DDL/history failures roll back.
   The live managed migration was applied through the authenticated Supabase tool;
   its actual generated version is reflected in the local migration filename.
   Do not apply it again, create a baseline table, reset the DB or fake history.
   Review-only header comments inherited in the registered SQL/config are historical;
   live migration history and deployed function state are authoritative. The applied
   migration bytes remain unchanged for reproducibility.
2. Use `supabase/tests/security_post_migration_readonly.sql` for catalog/fingerprint
   checks. `security_existing_database.sql` requires separate explicit fixture
   inputs, bounded mutations and original-hash guards; SQL claim simulation is not
   signed JWT validation. Never run the old isolated-only `security_negative_access.sql`
   against the existing database. Real Auth/API/CAPTCHA/concurrency checks have separate native/browser evidence;
   revalidate them after relevant changes. Only read-only checks are authorized for
   documentation synchronization. Preserve all current reports, including any test
   record the owner has chosen to retain; a synthetic label is not cleanup approval.
   The prepared security_existing_database.sql also pins the historical two-row
   baseline and requires a designated actor not already allowlisted. It intentionally
   refuses the current three-record/operator state. Never delete a retained record
   or revoke the owner just to satisfy it; a new fixture run needs separate review.
3. Have the project owner create/invite and verify a real Supabase Auth account
   through the trusted dashboard. Choose credentials privately. No account or
   password is created by this implementation. Obtain its UUID from the trusted
   Auth console and insert **that UUID** into report_security.admin_allowlist using
   the database owner role. No browser/user-facing allowlist management is exposed.
4. Add/revoke allowlist rows only through an authorized operator. Require a strong
   unique password; configure Auth login abuse protection and consider mandatory
   MFA before wider admin access. Production implements password Auth plus
   session/allowlist enforcement, not an MFA enrollment/challenge flow.
5. Review any pre-existing functions/triggers/views exposing user_reports and
   legacy invalid rows before adoption. NOT VALID checks preserve old rows but
   apply to new/updated rows; invalid legacy rows can block a status update.
   Never silently rewrite research evidence. Approve any cleanup separately.
6. Keep the existing real Turnstile widget and secret; do not recreate it for a
   documentation/source update. For canonical production, allow hostname
   final-project-eta-peach.vercel.app in the widget and exact origin
   https://final-project-eta-peach.vercel.app in FEEDBACK_ALLOWED_ORIGINS. Add
   localhost/authorized Preview or staged hostnames only when needed and retain
   existing authorized origins when appending a new one. Hostname entries have no
   scheme/path; the Edge secret contains comma-separated full origins, no wildcard.
   Configure TURNSTILE_SECRET_KEY privately in Supabase. The platform supplies
   server-only SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY; never print/ship them.
   The public function's verify_jwt=false is deliberate: real CAPTCHA plus validated
   service-only ingestion replaces login for anonymous feedback, not administrator
   authorization. Every alias needs its own explicit CORS/widget review.
7. After a reviewed function change, type-check/run it in an approved test scope. Verify
   Turnstile server-side success, expiry, replay, wrong-host/action and failure.
   No raw IP, CAPTCHA token, password or auth token is logged/stored by the handler.
8. Configure only public frontend values for a newly reviewed candidate. Add exact
   Supabase HTTPS origins to its connect-src and challenges.cloudflare.com to its
   script-src/frame-src/connect-src, retaining the original WASM policies. Do not
   edit the old frozen package, protected Preview or production configuration.
9. Validate actual Auth/RLS REST allow/deny behavior, UI operations, consent/error
   recovery, concurrency and browser security headers before each new release. The
   existing production build has accepted evidence; do not repeat mutations as part
   of a documentation-only synchronization. Keep current report fingerprints intact.

## Data and abuse boundaries

The user claim is binary Human / AI-Generated, matching the existing feedback UI;
the model category/probabilities remain human, gpt, gemini, other. Server validation
checks the approved model ID, finite normalized probabilities, consistent total AI
percentage/argmax, text limits and forced pending status. Predictions submitted by
a browser can still be forged consistently: feedback is **untrusted user opinion**,
never independently verified authorship or automatic training data.

Global rate caps are atomic in Postgres and survive browser resets, IP spoofing and
Edge restarts; no localStorage limiter is trusted. They intentionally cap total
storage growth and can temporarily deny legitimate users if an attacker consumes
the allowance. CAPTCHA does not eliminate human abuse. A trusted gateway/WAF
per-source limit can be added after its real client-IP contract is verified; do not
trust arbitrary X-Forwarded-For. Review daily caps, alerting and retention before
wide public access. Owner-scheduled removal of expired window/challenge metadata
and report retention requires a separately reviewed maintenance policy; none runs
automatically here.

The admin screen intentionally displays only the latest 100 rows. Counts apply to
those loaded rows, not the entire database. Export/pagination and detailed audit
logs remain separate improvements. Approving a report changes review status only;
it does not retrain, export, replace or select the classifier.

If rollout fails, keep inference-only staging and disable new backend mode. Do not
restore public read/update/delete/TRUNCATE grants or the browser passcode. Prefer a
forward security correction after preserving evidence. No SQL rollback is applied.

## Deployment, current verification and rollback

Production is dpl_4buo7fcyQsdPAKenZoGjpdvgZTrt. The canonical public URL is
https://final-project-eta-peach.vercel.app/. Its previous staged protection and
acceptance records describe the pre-promotion checkpoint, not the current alias
state. All three production aliases are verified on the new deployment; per-host
feedback coverage still requires the explicit hostname/origin configuration above.

Vercel Production Branch is deploy, Root Directory ai-detection-app, with Only build
production as the ignore rule. The deploy branch has unrelated history; never merge
main into it automatically. Source review/commits on a non-production branch do not
replace a separately approved, verified artifact release. The local retirement of
the old anonymous keepalive becomes the default scheduled workflow only after its
reviewed merge into main; no RLS exception should be added to make that old job work.

Previous deployment dpl_GnJvRAogUL4XoUjewLy7A4GNZBWU is retained for rollback.
Do not automatically promote, roll back, reapply migrations or restore legacy grants.
A frontend rollback does not roll back database security; old anonymous clients
remain denied. Prefer a reviewed forward correction with preserved backups and
current data fingerprints. The encrypted backup is table-scoped, not complete
Auth/project recovery. Store its archive and recovery key separately and privately.

Verification distinguishes local regression tests from genuine Auth/API tests,
native trusted-service concurrency from CAPTCHA HTTP load tests, and owner UI
actions from independently captured database states. Current source synchronization
runs local checks and read-only production/data checks only. Full research fixtures,
browser profiles, database receipts/backups and deployment wrappers stay private in
the experiment archive. Never force-add them to publish this guide.
