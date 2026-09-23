# Per-resident document library (Infomaniak)

## Environment variables

Set these on the Node.js host (and locally in `.env`):

| Variable | Purpose |
|----------|---------|
| `KDRIVE_API_TOKEN` | Infomaniak API token with kDrive read scopes (never sent to the browser) |
| `RESIDENT_LIBRARY_DRIVE_ID` | kDrive id (default `4047143`) |
| `RESIDENT_LIBRARY_ROOT_ID` | Society root folder id (default `6`) |
| `RESIDENT_LIBRARY_ROOT_NAME` | Display name (default `Society documents`) |
| `RESIDENT_LIBRARY_EXCLUDED_IDS` | Comma-separated folder ids hidden from residents |
| `DATA_DIR` | Directory for `library.sqlite` and `users-seed.json` (must persist across git rebuilds) |
| `APP_BASE_URL` | Public site URL for reset links (default `https://cotewall-mews.ltd`) |
| `SMTP_HOST` | Default `mail.infomaniak.com` |
| `SMTP_PORT` | Default `587` |
| `SMTP_USER` | Mailbox login, e.g. `directors@cotewall-mews.ltd` |
| `SMTP_PASS` | Mailbox password |
| `SMTP_FROM` | Optional From header (defaults to `SMTP_USER`) |

The old shared `RESIDENT_LIBRARY_PASSWORD` and public `RESIDENT_LIBRARY_SHARE_UUID` are no longer used.

## Seed users

1. Copy `data/users-seed.example.json` to `data/users-seed.json` (or into `DATA_DIR`).
2. Replace placeholder `@example.com` addresses with the six remaining apartment emails.
3. Keep the three directors as `role: "director"`.
4. Restart the Node app. New emails are inserted on boot; existing rows keep their passwords.

## Go-live checklist

1. Create a long-lived Infomaniak API token with Drive read access; set `KDRIVE_API_TOKEN`.
2. Set SMTP vars for `directors@cotewall-mews.ltd`.
3. Point `DATA_DIR` at a path that survives Infomaniak git rebuilds.
4. **Revoke** the public kDrive share on the Society root (`60945e17-1111-4f92-90c3-185f6ff51d5c`) so only `/api/library/file` can deliver files.
5. Rebuild / restart Node; smoke-test director login, resident login, hidden folders, reset email, and `/library-log`.

## Directors tools

- Access log: `/library-log` (signed-in directors only)
- Clear a user’s password from that page to force first-visit setup again
