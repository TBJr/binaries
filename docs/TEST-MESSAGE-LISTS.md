# Test message lists

Settings → Test Message can send the same rich-text message to one allowlisted address, or as separate SMTP submissions to a recipient list that an authorized user has marked as a **test list**.

This is a controlled test. It does not enable campaign delivery. Phase 8 remains disabled: there is no campaign worker, schedule, tracking, or unlimited batch send.

## How a list becomes a test list

Recipient lists live in `contact_lists`. Membership is `contact_list_members`. Migration `0010_test_message_lists.sql` adds `is_test_list boolean not null default false`. Existing lists stay ordinary.

Users with `lists.update` can mark or unmark a list from Contact lists or the list details page. The API is `PATCH /api/contact-lists/:id` with `{ "isTestList": true }`. `lists.create` can set the flag when the list is created. The server records `recipient_list_marked_test` or `recipient_list_unmarked_test`.

Ordinary lists do not appear in the Test Message selector. The server rejects a send if the list is missing, owned by someone else, or not marked as a test list.

## Permissions

| Action | Permission |
| --- | --- |
| Mark or unmark a test list | `lists.update` |
| List test lists and send | `mailbox.send_test` |

The browser hiding a control is not the authorization check. Both routes are enforced in the API permission middleware and again in the mailbox helper for sends.

## Recipient modes

`POST /api/mail/test-send`

Single recipient (unchanged, including requests that omit `recipientMode`):

```json
{
  "recipientMode": "single",
  "testRecipient": "qa@example.com",
  "subject": "Complete Your Registration",
  "text": "Hello",
  "html": "<p>Hello</p>",
  "confirm": true,
  "idempotencyKey": "11111111-1111-4111-8111-111111111111"
}
```

The address must be on the `SPACEMAIL_TEST_RECIPIENTS` allowlist. That path does not consult contact suppressions.

Test list:

```json
{
  "recipientMode": "test_list",
  "testListId": "list-uuid",
  "subject": "Complete Your Registration",
  "text": "Hello",
  "html": "<p>Hello</p>",
  "confirm": true,
  "idempotencyKey": "11111111-1111-4111-8111-111111111111"
}
```

The server loads members from the database. A body that includes `recipients`, `to`, `cc`, or `bcc` arrays is rejected. Test-list addresses do not have to be on the environment allowlist. The test-list flag, ownership, and eligibility rules are the authorization.

## Eligibility

Evaluated on the server when the send starts, using the same rules as campaign eligibility:

- The list must be `is_test_list`
- The contact must belong to the signed-in user
- The address must be valid
- Subscription status must be `subscribed`
- The address must not be in `email_suppressions`
- Duplicate addresses collapse to one contact
- Unsubscribed, pending, unknown, and invalid addresses are skipped

Deleted contacts disappear with their membership row, so they are not selected.

Suppression is checked again immediately before each SMTP submission. A contact suppressed after the snapshot is not sent.

The eligible set is stored on the test-message operation. A retry of the same idempotency key uses that snapshot. It does not pick up members added after the operation started.

## Safety cap

`TEST_MESSAGE_MAX_LIST_RECIPIENTS` defaults to **8**. The server accepts 1–25. A missing or invalid value uses 8. If the eligible count is above the cap, the send is rejected and no SMTP call is made.

The send runs in the API request, one recipient after another. Eight messages fit a normal request. This does not use BullMQ or the campaign queue. Do not raise the cap into campaign size; a larger cap can exceed the serverless time limit and is still not campaign delivery.

## SMTP

Each eligible address gets its own message:

- one `To`
- no `Cc`
- no `Bcc`
- the same sanitized HTML and plain-text alternative as the single test message

`submitSingleRecipientMessage` is the single-recipient transport without the environment allowlist. `submitAuthorizedMessage` still checks that allowlist for single-recipient tests.

A permanent rejection for one address is stored on that submission and the loop continues. An SMTP authentication or connection failure stops the remaining addresses. Submissions already accepted stay accepted.

Wording in the product is **SMTP accepted**, **Failed**, **Suppressed**, and **Skipped**. Acceptance is not inbox delivery.

## Idempotency

The client idempotency key is unique on `test_message_operations`. Each recipient submission uses `idempotencyKey:contactId`, and migration `0011_test_list_submission_uniqueness.sql` also enforces one row per operation and contact, and one row per operation and normalized email. A concurrent insert that loses the unique constraint does not call SMTP. A row left `pending` or `unknown` after a crash is not submitted again. That recipient is reported as unknown. Start a new idempotency key only when you accept that an uncertain message might already have been accepted by Spacemail.

At the default cap, the existing test-send limit of 3 operations per hour can submit up to 24 SMTP messages (3 × 8). That limit was left unchanged.

The parent idempotency key is the `test_message_operations` row. Each recipient submission uses `idempotencyKey:contactId` on `mail_submissions`.

A repeated request with the same key returns the stored summary and does not submit the list again. A recipient row that already exists is not sent again. A pending or unknown row is left unknown rather than submitted a second time. A new idempotency key can submit that address again, which can duplicate a message Spacemail already accepted. This is not a universal exactly-once guarantee from the mail provider.

One test-list operation counts as one item in the existing test-send rate limit (3 per hour, 1 minute apart). The individual recipient rows do not each consume that limit.

## Audit

| Action | Contents |
| --- | --- |
| `recipient_list_marked_test` / `recipient_list_unmarked_test` | List id and name |
| `test_message_list_send_requested` | Counts only |
| `test_message_list_send_completed` / `test_message_list_send_failed` | List id, requested, eligible, accepted, failed, suppressed, skipped |

Audit metadata does not include the recipient list, message body, or SMTP credentials.

## Migration

Apply `0010_test_message_lists.sql` with `npm run db:migrate` on each environment before deploying this build. The migration is forward-only:

- `contact_lists.is_test_list` defaults to false, so current lists stay ordinary
- `test_message_operations` groups one test-list send
- `mail_submissions.operation_id` and `contact_id` link each recipient submission

Do not edit migrations `0008` or `0009`. Do not reset the database. After migrate, confirm an unmarked list is absent from `GET /api/mail/test-lists` and cannot be posted to `/api/mail/test-send`.
