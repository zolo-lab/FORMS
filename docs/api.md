# REST API (`/api/v1`)

For systems such as Make that create requests and read their status. Every key belongs to **one organization** and only sees that organization's requests.

## Keys

Admin → API → "יצירת מפתח". The key (`fk_…`) is shown once; only its hash is stored. Revoke it from the same page.

Send it on every call:

```
Authorization: Bearer fk_xxxxxxxx…
```

Missing or revoked key → `401 {"error":"unauthorized"}`.

## `GET /api/v1/templates`

Packages (document sets) the key may use, with the fields the caller must send in `answers`.

```json
{ "templates": [ { "id": "…", "name": "קליטת עובד רגיל", "description": "…",
    "documents": ["טופס 101"],
    "steps": [ { "order": 1, "role": "requester", "action": "fill" }, … ],
    "requesterFields": [ { "id": "salary", "label": "שכר", "type": "currency", "required": true } ] } ] }
```

## `POST /api/v1/requests`

```json
{
  "packageTemplateId": "uuid",
  "subject": { "name": "דנה כהן", "idNumber": "123456782", "email": "dana@example.org", "phone": "050-1234567" },
  "answers": { "salary": 9000 },
  "expiresAt": "2026-11-30T00:00:00Z",
  "redirectUrl": "https://example.org/thanks",
  "apiParams": { "crmId": 42 },
  "send": true
}
```

- `subject.name` is required; with `send: true` (the default) an email or phone is required too.
- `answers` are validated against the requester's fields of the package (same rules as the admin wizard). Errors come back as `answers.<fieldId>`.
- `expiresAt` must be in the future, at most 365 days ahead (default: 30 days).
- `redirectUrl` (https) and `apiParams` (≤ 4 KB) are stored with the request.
- `send: false` leaves the request as a draft.

`201`:

```json
{ "id": "uuid", "status": "in_progress", "links": [ { "stepId": "…", "role": "employee", "url": "https://…/s/…" } ] }
```

`links` are the one-time signing links; they are also emailed/SMSed when the recipient has an address. Errors: `400` malformed body, `404` unknown package, `422` invalid `answers`:

```json
{ "error": "validation_failed", "errors": { "subject.email": "invalid email" } }
```

## `GET /api/v1/requests`

Query: `status` (`draft|in_progress|returned|completed|declined|cancelled|expired`), `from`, `to` (ISO dates, on `createdAt`), `limit` (1-200, default 50), `before` (cursor).

```json
{ "requests": [ { "id": "…", "status": "completed", "subjectName": "…", "packageTemplateId": "…", "createdAt": "…", "completedAt": "…", "expiresAt": "…" } ],
  "nextBefore": "2026-10-01T08:00:00.000Z" }
```

Pass `nextBefore` as `before` to get the next page (`null` = last page).

## `GET /api/v1/requests/:id`

Subject, steps, documents and — when completed — all collected `answers`. Each finished document has `pdfUrl`, a link that works without a key for 24 hours.

## `DELETE /api/v1/requests/:id`

Cancels an open or draft request. `409` if it is already completed, declined, cancelled or expired.

## Related

Outgoing events (request completed, step completed, request declined) are configured under Admin → Webhooks.
