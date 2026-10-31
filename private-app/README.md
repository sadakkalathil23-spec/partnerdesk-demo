# Detailed PartnerDesk private app

This preserves the original PartnerDesk v3.4 interface and all its sections. The API now runs on the server with a single administrator sign-in. No real customer data or account credentials belong in this source repository.

## Local installation

Node.js 22 or later is required. No npm dependencies are needed. Run `npm test`, then `npm start`. Open http://localhost:3033.

Private installation files go in `data/` (ignored by Git):

- `captured-records.json`: the saved 255-record export with expanded fields and captured histories.
- `database.json`: the existing private-account file, containing its salted password hash, original records and local change history.
- `workspace.json`: generated server database for the detailed interface. Back up this file after making changes in the detailed app.

The existing administrator account is reused; no password is included in the source. Additional login accounts and credential changes are blocked. Demo users shown in personnel screens cannot sign in. Original sample data in uncaptured modules remains demo data, not reconstructed source records.

The sign-in cookie is HttpOnly and SameSite=Strict. Record endpoints require a valid server session, and writes require a CSRF token and matching origin. Captured records are available only through an authenticated endpoint. Original source snapshots remain available through Copied records. Data persists across restarts, but sessions expire on restart.

## Deployment status

GitHub Pages cannot run this Node server. Publishing this source alone does not deploy the private app. Deploy it to a selected private backend host with HTTPS and persistent storage, mount the private data outside the public assets, enable Secure cookies, and configure the server's bind address for that hosting environment. Finish administrator setup locally before exposing the server. The delivered server binds to loopback for local testing.

The existing Pages site should stay unchanged until that backend is deployed and its online sign-in, data isolation and persistence are verified. It can then redirect to the private host, preserving the old bookmark.

This adapts the prototype's server rules; it is not a claim that every module matches the original remote application's internal backend. Automated checks cover record isolation, sign-in, CSRF/origin enforcement, single-account restrictions, saved leads, notes, timelines, trash/restore and restart persistence. Additional full-module acceptance testing and operational backup/recovery setup remain before online use.
