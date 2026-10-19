# DV-NOTE plus

An Android-first, client-side encrypted text vault (AES-GCM 256-bit with PBKDF2 SHA-256 key derivation) and bidirectional cryptographic micro-service API built entirely without a backend for deployment on GitHub Pages.

No backend. No database fees. No tracking. Zero dependencies.

## Features

- **Sovereign Cryptography:** Text is encrypted in browser memory via native Web Crypto API prior to persistence.
- **Two-Way Cryptographic API:** Other applications can transmit payloads via `postMessage` or URL parameters to leverage client-side encryption/decryption as a headless micro-service.
- **Master Passphrase Protection:** Zero-knowledge vault architecture. If the passphrase is lost, the data is cryptographically unrecoverable.
- `dv_vault` — Encrypted records array containing `{ ciphertext, iv, salt }`
- `theme` — `"light"` or `"dark"`

No user permissions required. Zero unencrypted data ever leaves your device.
