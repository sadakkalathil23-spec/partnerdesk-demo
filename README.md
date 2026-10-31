# PartnerDesk private GitHub Pages edition

The live website opens with an email/password screen. The full detailed PartnerDesk application and captured records are contained in an AES-256-GCM encrypted bundle, unlocked in the browser using PBKDF2-SHA256 with 600,000 iterations and a random salt. No password, decryption key or readable customer export is published in this repository. There is no public registration.

The unlocked app preserves the original detailed interface and includes the 255 saved leads, 252 expanded source records and 52 saved full histories. It labels uncaptured content unavailable. Existing sample data in uncaptured modules remains sample data.

This is a password-encrypted static app, not server-side identity authentication. Anyone given the password can unlock it; there is no per-person identity verification, two-factor authentication, individual revocation or central rate limiting. Password changes require rebuilding the encrypted bundle. Previously downloaded copies cannot be revoked.

Changes save encrypted in the current browser. They do not synchronize between devices or users. Lock/Sign out clears the unlocked app and key from the page. Avoid shared or untrusted computers. Exported files are readable copies; protect them separately.

The optional `private-app/` directory contains the earlier server-backed version for future deployment with central storage. Its private runtime files are excluded from Git.
