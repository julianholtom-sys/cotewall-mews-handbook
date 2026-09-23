# Digital Services Register — Cotewall Mews

**Do not record passwords, MFA codes, recovery codes, API keys, or payment card / PayPal credentials in this file.**

| Field | Entry |
|-------|--------|
| Service | Domain |
| Purpose | Society website and email domain |
| Provider | Infomaniak Network SA |
| Domain / name | cotewall-mews.ltd |
| Renewal period | Multi-year (approx. 5 years prepaid from Sep 2026) |
| Renewal / expiry date | 21 September 2031 (RDAP) |
| Society owner / role | Infomaniak Organisation — Legal Representative |
| People / roles with admin access | Legal Representative; Administrators as appointed |
| Where billing is managed | Infomaniak Manager → Organisation → Accounting |
| Where credentials are stored | Individual Infomaniak logins + directors' password manager / recovery vault (not in kDrive) |

| Field | Entry |
|-------|--------|
| Service | Web Hosting (Node.js) |
| Purpose | Host Residents' Handbook + per-resident document library |
| Provider | Infomaniak |
| Domain / name | cotewall-mews.ltd on Web Hosting 1 |
| Renewal / expiry date | 20 September 2031 (Manager) |
| Deploy | GitHub → Infomaniak Node.js (`npm install`, `npm start`, PORT) |
| Repository | github.com/julianholtom-sys/cotewall-mews-handbook |
| Library auth | SQLite users + access_log; bcrypt passwords; Infomaniak SMTP for resets |
| Required host env | See docs/LIBRARY-AUTH.md (`KDRIVE_API_TOKEN`, `DATA_DIR`, `SMTP_*`, …) |
| Admin access | Infomaniak hosting administrators |

| Field | Entry |
|-------|--------|
| Service | kSuite Essential (Mail + kDrive) |
| Purpose | directors@ mailbox; document repository |
| Provider | Infomaniak |
| Domain / name | kSuite for cotewall-mews.ltd |
| Mailbox | directors@cotewall-mews.ltd (shared with directors) |
| kDrive | Society document tree under CO-OWNERS MAINTENANCE SOCIETY |
| Website access | Server-side API only — do not leave a public share on the Society root |
| Renewal | Align with kSuite / prepaid term (confirm in Manager Accounting) |
| Admin access | Legal Representative; director Administrators |

| Field | Entry |
|-------|--------|
| Service | SSL certificate |
| Purpose | HTTPS for website |
| Provider | Infomaniak (managed with hosting) |
| Domain | cotewall-mews.ltd |

## Payment arrangement (status)

- Current arrangement (as directed by Society): prepaid multi-year term using a director's personal PayPal account.
- **Long-term requirement:** move renewals to a Society-controlled payment method (Society bank debit/credit card) well before September 2031.
- Do **not** change the live payment method without Society approval.
- Prefer multiple directors receive Infomaniak billing / renewal notifications.

## Last reviewed

23 September 2026 — per-resident library auth (no secrets in this file).
