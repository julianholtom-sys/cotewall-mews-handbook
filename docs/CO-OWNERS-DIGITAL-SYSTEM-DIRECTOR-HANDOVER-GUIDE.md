# CO-OWNERS DIGITAL SYSTEM – DIRECTOR HANDOVER GUIDE

Cotewall Mews Co-Owners Maintenance Society  
Domain: cotewall-mews.ltd  
Public directors email: directors@cotewall-mews.ltd  

This guide is for a future director with little technical knowledge.  
**Never store passwords, MFA seeds, recovery codes, or payment card details in this guide, in Git, on the website, or in ordinary kDrive folders.**

---

## 1. What Infomaniak services the Society uses

| Service | Purpose |
|--------|---------|
| Domain `cotewall-mews.ltd` | Society web address and email domain |
| Web Hosting (Node.js) | Hosts the Residents' Handbook website |
| kSuite Essential | Mail, kDrive, collaboration for the organisation |
| Email | Permanent Society mailbox `directors@cotewall-mews.ltd` |
| kDrive | Shared document repository |
| SSL | HTTPS for the website |

Provider: Infomaniak (Swiss). Management console: https://manager.infomaniak.com  

---

## 2. The domain

Production domain: **cotewall-mews.ltd**  
Website: https://cotewall-mews.ltd/  
Do not point this domain elsewhere without Society agreement.

---

## 3. The directors' email

Permanent public address: **directors@cotewall-mews.ltd**  

Use this for routine Society correspondence. It is the authoritative record of resident–director email.  
Do **not** auto-forward all Society mail to personal inboxes as the default arrangement.

---

## 4. How directors gain access to the mailbox

1. Each director should have their **own** Infomaniak login (named user).
2. Access to `directors@` is granted by **sharing** that mailbox with their Infomaniak user (no shared password).
3. Open Infomaniak Mail (https://mail.infomaniak.com or kSuite Mail).
4. Switch address (chevron top-left) to `directors@cotewall-mews.ltd` when working as the Society.
5. Send from `directors@` so replies stay on the Society record.

If invited as an external user, accept the Infomaniak invitation email first, then the shared mailbox appears.

---

## 5. How the kDrive structure works

Root folder: **CO-OWNERS MAINTENANCE SOCIETY**

Main areas:

1. Governing Documents  
2. Accounts & Finance (by year; bank statements split Directors-original vs Residents-published)  
3. Running Costs (by year)  
4. Meetings (AGM / other residents / directors)  
5. Companies House & Statutory Records  
6. Property & Maintenance  
7. Insurance (by year)  
8. Digital Services & Administration (registers, handover, renewals)

Historical bulk scanning of old paper archives is **not** required. Focus on the present directors' tenure; add older material only when important or already digital.

---

## 6. Which material residents can see

Residents get **read-only** access to a designated resident-facing area (or share), for example published accounts, redacted statements, AGM papers, insurance schedules, and other agreed transparency documents.

Residents must **not** edit, delete, upload into official folders, or change permissions.

Directors-only material (unredacted bank statements, claims with personal data, directors' meeting notes, etc.) must stay outside the resident share.

---

## 7. How to add a new director

1. Invite them as an Infomaniak Organisation user (Administrator or User with required product rights).  
2. Enable MFA on their account.  
3. Share `directors@cotewall-mews.ltd` with them.  
4. Grant appropriate kDrive write/manage access to Society folders.  
5. Enable billing/renewal notification preferences if they should receive Infomaniak service alerts.  
6. Update the website emergency contacts table if phone/email change.  
7. Update Companies House / Society records as required by law (separate from Infomaniak).

---

## 8. How to remove an outgoing director

1. Remove their access to `directors@` (Shared with).  
2. Revoke kDrive permissions.  
3. Remove or downgrade their Infomaniak Organisation / kSuite role.  
4. Remove pending invitations if any.  
5. Update website emergency contacts.  
6. Confirm they no longer receive billing/admin notifications unless still appropriate.  
7. Do **not** ask for their password — revoke access instead.

---

## 9. Who controls the organisation-level account

Infomaniak provides a **Legal Representative** role with highest authority (products, users, accounting, recovery).  

As of the initial setup, the Legal Representative was the Infomaniak account used to create the organisation.  

The Legal Representative should remain a Society-controlled designation, not a permanent personal entitlement of one director. When that person leaves, transfer Legal Representative status using Infomaniak's official process **before** removing their access.

---

## 10. How renewals work

Domain, hosting, and kSuite were prepaid for a multi-year term (around five years from September 2026, with renewals around September 2031).  

Infomaniak can send renewal and invoice reminders to users who are allowed to receive billing communications. Prefer **multiple directors** receiving those alerts so the Society does not depend on one person checking the Directors mailbox.

---

## 11. Where renewal dates are recorded

See kDrive:  
`08 – Digital Services & Administration / Renewal Information`  
and the Digital Services Register in the same area.

---

## 12. How the website links to kDrive

The handbook at https://cotewall-mews.ltd/ includes **Society documents** (§10).  
Residents and directors sign in with their **registered email** (first visit sets a personal password). The Node app lists and streams files from kDrive using a **server-side API token** — there must be **no public kDrive share link** on the Society root.

- Directors see the full tree (including bank statements and folder 08).  
- Residents do not see bank statements or Digital Services & Administration.  
- Directors can open the access log at `/library-log`.  
- Ops details (env vars, seed users, SMTP, revoke share): see `docs/LIBRARY-AUTH.md`.

Source code / deploy: GitHub repository connected to Infomaniak Node.js hosting (`npm install` / `npm start`).

---

## 13. How to update emergency contact details

1. Edit `public/index.html` in the website repository (Contacts section).  
2. Commit and push to the connected GitHub branch.  
3. Rebuild/restart the Node.js site in Infomaniak if auto-deploy does not run.  
4. Spot-check the live Contacts section.

---

## 14. How to update the normal Directors contact information

The permanent Society address is always **directors@cotewall-mews.ltd**.  
If that address ever must change (rare), update:

- the mailbox / aliases in Infomaniak Mail  
- the website mailto links  
- any letterheads / AGM notices  

Do not replace it with a personal email as the public Society address.

---

## 15. Credentials are not stored in the document repository

Use a proper password manager / Infomaniak account recovery / MFA recovery codes stored **offline or in a dedicated secure vault** agreed by the directors.  

This kDrive guide must never contain:

- passwords  
- MFA seeds or recovery codes  
- PayPal / card numbers  
- API tokens  

---

## 16. Transferring control when the principal account owner changes

1. Ensure at least two administrators understand the process.  
2. Appoint the incoming Legal Representative in Infomaniak **before** the outgoing person loses access.  
3. Transfer billing notification rights.  
4. Confirm payment method is still valid (ideally a Society card, not a personal PayPal long-term).  
5. Re-verify MFA and recovery options for remaining privileged users.  
6. Revoke the outgoing director's access only after the above succeed.  
7. Record the change date in the Digital Services Register (no secrets).

---

*Prepared for Cotewall Mews Co-Owners Maintenance Society. Review and update when directors or services change.*
