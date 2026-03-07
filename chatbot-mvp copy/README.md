# Multi-tenant Chatbot SaaS MVP

A simple, working MVP for a multi-tenant AI chatbot platform for small businesses.

## Architecture (MVP)

- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)
- AI: OpenAI Chat Completions API
- Multi-tenancy model: shared DB, strict row-level tenant scoping by `business_id`
- Widget delivery: single embeddable `widget.js`
- Admin: lightweight `/admin` page + admin API routes

## Tenant Isolation Strategy

- Each business has unique `widget_id` and `allowed_domain`.
- Public chat resolves business strictly by `widget_id`.
- Every tenant-owned query filters by `business_id`.
- Prompt includes only that tenant's KB rows.
- Origin is checked against `allowed_domain` before chat completion.

## Data Model

- `businesses`: tenant profile, branding, tone, widget id, allowed domain
- `business_kb_entries`: per-business knowledge base rows
- `chat_logs`: per-business logs for analytics and quality review
- `subscriptions`: billing state and provider IDs (Stripe-ready fields)

## API Routes

### Public

- `GET /api/public/widget/:widgetId/config`
- `POST /api/public/chat`

### Admin (requires `x-admin-api-key`)

- `GET /api/admin/businesses`
- `POST /api/admin/businesses`
- `PATCH /api/admin/businesses/:businessId`
- `GET /api/admin/businesses/:businessId/kb`
- `POST /api/admin/businesses/:businessId/kb`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Initialize DB with sample tenant:

```bash
npm run db:init
```

4. Start server:

```bash
npm run dev
```

5. Open admin dashboard:

- `http://localhost:4000/admin`

## Embed Snippet

```html
<script
  src="http://localhost:4000/widget.js"
  data-api-base="http://localhost:4000"
  data-widget-id="wid_xxxxxxxxxxxxxxxx"
></script>
```

Use a widget ID from `GET /api/admin/businesses`.

## Notes on Billing Readiness

- `subscriptions` table already stores plan/status and Stripe IDs.
- Next step is adding Stripe checkout + webhook endpoints to update `subscriptions`.
- Gate chat usage by subscription status for production.

## Human Handoff Email

- Each business can now store a `handoff_email` (set in `/admin` on create/edit).
- If an end user asks for a real person (for example: "talk to a human"), the app:
  - Summarizes the inquiry from recent chat context
  - Sends that summary to the configured handoff email via local `sendmail`
  - Replies in chat confirming a human follow-up
- Optional env vars:
  - `HANDOFF_FROM_EMAIL` (default: `no-reply@atlaschat.local`)
  - `EMAIL_PROVIDER` (`sendmail` default, or `resend`)
  - `RESEND_API_KEY` (required when `EMAIL_PROVIDER=resend`)
  - `SENDMAIL_PATH` (default: `/usr/sbin/sendmail`)

## Production Hardening (next)

- Replace origin check with signed widget tokens (short-lived JWT)
- Add server-side rate limiting + abuse prevention
- Encrypt sensitive data at rest and in transit
- Add audit logs and RBAC admin users
- Move from SQLite to Postgres with row-level security patterns
