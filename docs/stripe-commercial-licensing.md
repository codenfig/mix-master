# Stripe commercial licensing setup (per song)

This integration uses Stripe-hosted Checkout. **No checkout is available until an operator explicitly approves commercial rights for the individual song request.** Do not approve rights unless your generation provider, samples, lyrics and other contributors permit sublicensing.

## Configuration

Install backend dependencies from `mixmaster_universal/requirements.txt`. Configure these server-only environment variables (never expose them in the frontend):

- `STRIPE_SECRET_KEY` — Stripe restricted/secret API key
- `STRIPE_WEBHOOK_SECRET` — signing secret for the configured webhook endpoint
- `STRIPE_COMMERCIAL_LICENSE_PRICE_ID` — active one-time Stripe Price, in the desired currency
- `PUBLIC_APP_URL` — HTTPS app origin, e.g. `https://your-domain.example`
- `LICENSE_ADMIN_TOKEN` — long random administrator secret; required to approve rights and access certificates

Configure the Stripe webhook URL `https://your-domain.example/api/stripe/commercial-license-webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Stripe Checkout processes card payments; never accept card numbers in MixMaster.

## Flow

1. A creator submits a per-song license request in My Music and receives a request ID. Keep it private; it is the checkout capability until account authentication exists.
2. An operator independently reviews the song and the full rights chain. **Only after documented rights clearance**, approve it using an authenticated backend administration process: `POST /api/commercial-licenses/requests/{request_id}/approve-rights` with the `X-License-Admin-Token` header.
3. The creator clicks **Pay with Stripe (after approval)**. The backend validates the rights status and the configured one-time Price, then returns a Stripe-hosted checkout URL.
4. Only a Stripe-signature-verified paid webhook matching the recorded order, price, currency and rights-approved request issues a license record. The browser redirect does not issue a license. Webhook retries are deduplicated.
5. An administrator can retrieve the issued license record at `GET /api/commercial-licenses/{license_id}/certificate` with the admin token.

## Production prerequisites

**Not ready for public production:** implement authenticated user accounts, enforce song ownership and request access, a secure admin rights-review audit trail, contractual license scope/terms and acceptance, customer certificate delivery, refund/dispute revocation handling, and robust payment reconciliation. Currently a license record is an administrative receipt, **not a standalone legal grant with agreed terms**. Keep live Stripe keys disabled until these are completed. Use Stripe test mode for integration testing.

Test rejected/forged webhooks, webhook retries, mismatched amounts, unapproved rights, successful payment, and delayed payment methods (only cards are currently enabled).
