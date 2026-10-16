# Contract signing records — phase 1 (STAGED, not live)

The four tables `client_contract_documents`, `client_contract_signers`, `client_contract_events` and `client_contract_deliveries` model immutable contract evidence associated with `public.clients` in the Jornal IR Supabase database.

- **One business client** may have multiple contract revisions. Each version has PDF original/final/evidence SHA-256 and private R2 object keys. Nothing stores a public PDF URL.
- Source identity: `subscription | commercial_sale | site_interest`, source UUID, and revision. **Site-interest records without a resolved master `client_id` must first be converted to a master client**; never create or auto-link using a name match alone.
- Signer invitations use only SHA-256 of randomly generated tokens, expiry and revocation; signers and events are not public to Supabase Data API. No anonymous direct database access.
- Owner/admin only read access, via RLS; **no authenticated write grants**. Write operations are future *server-only* actions with explicit role checks plus service credentials. Operators need a dedicated document-permission policy before being enabled.
- Protected PDF bucket: **`R2_CONTRACTS_BUCKET`**, intentionally does **not** fall back to the public media R2 bucket. Configure as a new PRIVATE bucket before enabling any upload or download.
- Signed versions cannot be altered; evidence events cannot be updated or deleted (triggers).
- Private original/final/evidence retrieval is provided at an authenticated admin route under each client; no public token route yet.
- E-mail resend, token issuance, OTP, PDF finalization, signed PDF production, custody and webhook remain disabled until issuer data, legal clauses, signing backend and mail provider are verified.
- `supabase/migrations/20261101000000_client_contract_document_records.sql` is **not applied to production**. The earlier staging migrations (Finance and Contract Settings) must first be tested and reconciled.
- The client area degrades safely to "not ready" if the migration is absent; it must never pretend there are zero documents when query failed.
- Existing `financeiro/contratos` institutional contracts are **separate entities**; this document contract storage must not overwrite them.
