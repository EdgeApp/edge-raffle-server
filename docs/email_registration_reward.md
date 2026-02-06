# Email Registration & Crypto Rewards

## Overview

Add a new feature to the edge-raffle-server that implements an email-verified cryptocurrency rewards flow. Users arrive via a campaign-specific URL containing their wallet address, submit their email, verify it via a link or a 4-digit code, and receive a fixed crypto payout through the NOWPayments API.

## User Flow

1. User visits `/rewards?data=<base64>` where the data param encodes their wallet address and ticker.
2. The server serves the landing page HTML. Before rendering the React SPA, the server (or the client on initial load) reads the `data` query parameter and embeds it into a hidden form field, then uses `history.replaceState` to strip the `data` param from the browser URL bar. This ensures the encoded wallet address is never visible in the address bar after the page loads.
3. The landing page presents an email input form with a Prosopo CAPTCHA (same integration as the existing raffle).
4. Client-side validation ensures the email is well-formed before the submit button is enabled.
5. On submit, the form posts the hidden `data` field along with the email and CAPTCHA token. The server:
   - Validates the CAPTCHA token via the Prosopo API.
   - Validates the email format server-side (same rules as client-side validation).
   - Validates and decodes the `data` param.
   - Checks the email and wallet address against **all prior completed registrations** across all campaigns. If either has already received a payout, reject with a duplicate error.
   - Searches for an active campaign matching the `ticker` from the data param.
   - Stores a pending verification record in CouchDB (including the `usdAmount`, a `verificationCode`, and a `verificationToken`).
   - Sends a verification email via Gmail (SMTP with App Password, same as `edge-autobot-server`). The email contains **both** a clickable verification link **and** a 4-digit verification code.
6. The user is presented with a **verification screen** that has a 4-digit code input field. They can either:
   - **Option A**: Enter the 4-digit code from the email directly on this screen and submit it.
   - **Option B**: Click the verification link in the email (which bypasses this screen entirely).
7. Either method triggers the server to set `status` to `"verified"`, look up the current exchange rate, convert the USD amount to crypto, send the crypto payout via the NOWPayments API, set `status` to `"paymentSent"`, and render a thank-you page.

## Dual Verification Methods

The system supports two verification methods. Both are presented to the user simultaneously -- the email contains a link and a code, and the client shows a code input screen after submission.

### Method A: 4-Digit Code Entry

1. After the email is submitted, the server generates a random 4-digit numeric code (`0000`-`9999`, zero-padded) and stores it as `verificationCode` on the verification record.
2. The success response from `POST /api/rewards/register` includes a `verificationId` (the doc `_id`) which the client stores in state.
3. The client navigates to the code entry screen, which displays:
   - A message: "We sent a verification code to your email."
   - Four input boxes for the 4-digit code (or a single text input accepting 4 digits).
   - A submit button.
4. On submit, the client calls `POST /api/rewards/verify-code` with the `verificationId` and `code`.
5. The server looks up the record by `verificationId`, checks that the code matches, that it hasn't expired, and that it hasn't already been used. On success, it triggers the payout flow.

### Method B: Email Link Click

1. The email also contains a clickable link with the `verificationToken` (a long random string, separate from the 4-digit code).
2. Clicking the link hits `GET /api/rewards/verify?token={verificationToken}`.
3. The server validates the token, triggers the payout flow, and renders a server-side thank-you page.
4. If the user has already verified via the 4-digit code, the link returns an "already verified" page.

### Why two methods?

- The **4-digit code** provides a seamless in-app experience -- the user stays on the page, checks their email on their phone or another tab, and types the code without leaving the flow.
- The **email link** is a familiar fallback that works even if the user opens the email on a different device or browser.

## Data Param Handling & URL Hiding

The `data` query parameter contains the user's wallet address and should not remain visible in the browser URL bar.

### Strategy

1. The server serves the SPA at `/rewards` regardless of whether `?data=` is present.
2. On mount, the React app reads `data` from `window.location.search`.
3. The value is stored in component state (or a hidden `<input type="hidden" name="data">` in the form).
4. Immediately after reading, the app calls:
   ```js
   window.history.replaceState({}, '', '/rewards')
   ```
   This removes the query string from the URL bar without triggering a page reload.
5. When the form is submitted, the `data` value is sent from the hidden field / state in the POST body -- it was never lost, just hidden from the URL bar.

### Why not server-side redirect?

A server-side redirect (302 to `/rewards`) would lose the data param before the client could read it. The client-side `replaceState` approach preserves the value in memory while cleaning the URL.

## Data Format

The `data` query parameter is a Base64-encoded string with three pipe-delimited fields:

```
edgerewards|{wallet-address}|{ticker}
```

| Field            | Description                                    |
| ---------------- | ---------------------------------------------- |
| `edgerewards`    | Fixed prefix; reject if missing or mismatched. |
| `wallet-address` | The user's cryptocurrency receiving address.   |
| `ticker`         | Lowercase currency code (e.g. `btc`, `xmr`).  |

### Example

Raw:

```
edgerewards|bc1qtmsvxx3zexaf9tq27kvzwxqancrprjmlg0tqen|btc
```

Encoded URL:

```
rewards.edge.app/?data=ZWRnZXJld2FyZHN8YmMxcXRtc3Z4eDN6ZXhhZjl0cTI3a3Z6d3hxYW5jcnByam1sZzB0cWVufGJ0Ywo=
```

### Validation

- Decode the Base64 string. Reject if decoding fails.
- Split on `|`. Reject if the result does not have exactly 3 parts.
- Verify the first part is `edgerewards`.
- Verify `ticker` is non-empty.
- Verify `wallet-address` is non-empty (further format validation is left to the NOWPayments API at payout time).

## Email Validation

Validation is performed **both client-side and server-side** using the same rules.

### Rules

1. **Local part** -- at least one character before the `@`.
2. **No sub-addressing separators in local part** -- reject addresses containing any of the following characters before the `@`:
   - `%` -- historically used for email routing (`user%host@gateway`). Some systems still support it for sub-addressing.
   - `=` -- used by some enterprise and self-hosted mail systems as an alternative sub-addressing separator.
   - Note: `+` is **not** rejected at input time. Instead, it is stripped during normalization (see below). This allows users to submit `user+promo@gmail.com` -- the email will be sent to that address, but duplicate checks will use the normalized form `user@gmail.com`.
3. **`@` sign** -- exactly one.
4. **Domain** -- at least two labels separated by `.` (e.g. `example.com`). May have three or more labels to support subdomains (e.g. `mail.example.com`, `dept.mail.example.co.uk`). Each label must be at least one character.
5. **No TLD whitelist** -- do not reject based on specific TLD strings since new TLDs are constantly being created.

### Regex (illustrative)

```
/^[^\s@%=]+@[^\s@]+\.[^\s@]+$/
```

Note the `%=` in the first character class (`[^\s@%=]`), which rejects the unsafe separators. The `+` is allowed since it is handled by normalization.

This allows `user@example.com`, `user+promo@example.com`, `user@mail.example.co.uk`.
This rejects `user%alias@domain.com`, `user=tag@domain.com`, etc.

### Email Normalization

To prevent a single mailbox from registering multiple times with alias variants, the server computes a **normalized email** at registration time. The normalized form is stored alongside the original email and is used for all duplicate checks.

#### Normalization steps (applied server-side only)

1. **Lowercase** the entire address.
2. **Strip sub-addressing suffix**: if the local part contains a `+`, discard everything from the `+` to the `@`.
   - `paul+promo@gmail.com` -> `paul@gmail.com`
3. **Strip dots from the local part**: remove all `.` characters from the portion before the `@`.
   - `p.a.u.l@gmail.com` -> `paul@gmail.com`
   - `first.last@example.com` -> `firstlast@example.com`

These two steps combined mean that `P.A.U.L+test@Gmail.com` normalizes to `paul@gmail.com`.

#### Normalization function (illustrative)

```ts
function normalizeEmail(email: string): string {
  const lower = email.toLowerCase()
  const [localPart, domain] = lower.split('@')
  // Strip everything from '+' onward in the local part
  const base = localPart.split('+')[0]
  // Strip dots from the local part
  const noDots = base.replace(/\./g, '')
  return `${noDots}@${domain}`
}
```

This function should live in `src/common/rewardsTypes.ts` so it can be unit tested and imported by the server.

#### Why normalize dots universally?

While dot-insensitivity is technically a Gmail-specific behavior, applying it universally is the safer approach for abuse prevention. The trade-off is that `first.last@otherprovider.com` and `firstlast@otherprovider.com` would be treated as the same address for duplicate checking. In practice this rarely causes false positives, and it eliminates the need to maintain a list of which providers ignore dots.

### Server-side validation

The server **must** re-validate the email format on the `POST /api/rewards/register` endpoint. Do not trust client-side validation alone. The same regex / validation function should be shared in `src/common/rewardsTypes.ts` so both client and server import it.

## Campaign Configuration (CouchDB)

Campaigns are stored in a `rewards_campaigns` database. Each document uses the campaign slug as its `_id` (which doubles as a URI path segment).

```jsonc
{
  "_id": "btc-launch-2026",
  "currencyPluginId": "bitcoin",
  "ticker": "BTC",
  "usdAmount": "5.00",
  "active": true,
  "description": "BTC launch promotion"
}
```

| Field              | Type    | Description                                               |
| ------------------ | ------- | --------------------------------------------------------- |
| `_id`              | string  | Campaign slug; used in URLs and as the CouchDB doc ID.    |
| `currencyPluginId` | string  | Edge currency plugin ID (e.g. `bitcoin`, `monero`, `ethereum`). Used to look up the exchange rate. |
| `ticker`           | string  | Uppercase currency code (e.g. `BTC`, `XMR`). Passed to NOWPayments for the payout. |
| `usdAmount`        | string  | Payout amount in US dollars (string to avoid floating-point issues). The server converts this to the equivalent crypto amount at payout time using the current exchange rate. |
| `active`           | boolean | Whether the campaign accepts new registrations.           |
| `description`      | string  | Human-readable label for internal use.                    |

The server searches the `rewards_campaigns` database for an active campaign whose `ticker` matches the `ticker` decoded from the user's `data` param (case-insensitive comparison). If no active campaign matches, the server returns an error. If multiple active campaigns match the same ticker, the first one found is used (there should only be one active campaign per ticker at a time).

### Campaign indexes

| Index name         | Fields             | Purpose                                    |
| ------------------ | ------------------ | ------------------------------------------ |
| `idx_ticker_active`| `ticker`, `active` | Fast lookup of active campaign by ticker.  |

## Database: Reward Verifications

Stored in a `rewards_verifications` database.

```jsonc
{
  "_id": "btc-launch-2026:1738780800000:abc123",
  "campaignId": "btc-launch-2026",
  "status": "created",
  "email": "p.a.u.l+promo@gmail.com",
  "normalizedEmail": "paul@gmail.com",
  "walletAddress": "bc1qtmsvxx3zexaf9tq27kvzwxqancrprjmlg0tqen",
  "ticker": "BTC",
  "usdAmount": "5.00",
  "cryptoAmount": null,
  "exchangeRate": null,
  "verificationToken": "a1b2c3d4e5f6...",
  "verificationCode": "4829",
  "createdAt": "2026-02-05T12:00:00.000Z",
  "expiresAt": "2026-02-05T12:10:00.000Z",
  "payoutId": null,
  "payoutStatus": null
}
```

| Field               | Type         | Description                                                     |
| -------------------- | ------------ | --------------------------------------------------------------- |
| `_id`               | string       | `{campaignId}:{timestamp}:{random}`                             |
| `campaignId`        | string       | References the campaign doc.                                    |
| `status`            | string       | Current state of this registration (see **Status lifecycle** below). |
| `email`             | string       | The user's original submitted email (preserved for sending).    |
| `normalizedEmail`   | string       | Lowercased, plus-suffix stripped, dots removed from local part. Used for all duplicate checks. |
| `walletAddress`     | string       | Decoded from the `data` param.                                  |
| `ticker`            | string       | Decoded from the `data` param.                                  |
| `usdAmount`         | string       | Copied from the campaign's `usdAmount` at creation time.        |
| `cryptoAmount`      | string/null  | The calculated crypto amount to send, set at payout time after rate lookup. |
| `exchangeRate`      | string/null  | The exchange rate used for conversion (e.g. `"97500.12"`), recorded for audit. |
| `verificationToken` | string       | Long random string included in the email link (for Method B).   |
| `verificationCode`  | string       | 4-digit zero-padded numeric code (e.g. `"0042"`) for in-page entry (Method A). |
| `createdAt`         | string (ISO) | Timestamp of record creation.                                   |
| `expiresAt`         | string (ISO) | 10 minutes after `createdAt`. Both the link and code expire at this time. |
| `payoutId`          | string/null  | NOWPayments payout ID after successful send.                    |
| `payoutStatus`      | string/null  | Status returned by NOWPayments (e.g. `finished`, `failed`).    |

### Status lifecycle

The `status` field progresses through four states. Each transition only moves forward -- it never goes backward. If a step fails, the status remains at its current value, making it easy to identify where the process stalled.

| Status         | Set when                                  | Meaning                                              |
| -------------- | ----------------------------------------- | ---------------------------------------------------- |
| `created`      | Record is first inserted into CouchDB.    | Registration received, email not yet sent.           |
| `emailSent`    | Verification email sent successfully.     | Email delivered, awaiting user verification.         |
| `verified`     | User clicks the link or submits the code. | Email ownership confirmed, payout not yet initiated. |
| `paymentSent`  | NOWPayments payout API call succeeds.     | Funds sent. This is the terminal success state and the flag used for global duplicate checks. |

**Failure scenarios by status:**

- Stuck at `created` -- email send failed (Gmail error, bad address, etc.).
- Stuck at `emailSent` -- user never verified (link expired, user abandoned).
- Stuck at `verified` -- rate lookup failed or NOWPayments payout failed.

### Indexes

Create the following CouchDB Mango indexes at database initialization (same pattern as the raffle server's `initDatabase`):

| Index name              | Fields                              | Purpose                                                           |
| ----------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `idx_normalizedEmail`   | `normalizedEmail`, `status`         | Fast global duplicate check by normalized email (query `status: "paymentSent"`). |
| `idx_walletAddress`     | `walletAddress`, `status`           | Fast global duplicate check by wallet address (query `status: "paymentSent"`). |
| `idx_verificationToken` | `verificationToken`                 | Fast token lookup when the user clicks the email link (Method B). |
| `idx_verificationCode`  | `_id`, `verificationCode`           | Fast code lookup when the user submits the 4-digit code (Method A). Queried by `_id` (verificationId) + `verificationCode`. |
| `idx_campaign_normalizedEmail` | `campaignId`, `normalizedEmail` | Check for duplicate pending/verified entries within a campaign.   |

All duplicate checks use `normalizedEmail` rather than the raw `email` field. The raw `email` is preserved on the document for sending the verification email to the correct address.

## Rate Limiting & Abuse Prevention

- **CAPTCHA**: Prosopo CAPTCHA on the email submission form, using the same `prosopoApiKey` and `prosopoSiteKey` already configured in `config.json` and `clientConfig.json` for the raffle feature.
- **Global duplicate check (email)**: On registration, compute the `normalizedEmail` and query `idx_normalizedEmail` for any document where `normalizedEmail` matches AND `status` is `"paymentSent"`. If found, reject -- this email (or an alias of it) has already received a payout from a prior campaign.
- **Global duplicate check (address)**: On registration, query `idx_walletAddress` for any document where `walletAddress` matches AND `status` is `"paymentSent"`. If found, reject -- this address has already received a payout.
- **Per-campaign duplicate check**: Also reject if the same `normalizedEmail` already has an entry for the *current* campaign at any status, using `idx_campaign_normalizedEmail`.
- **Link and code expiration**: Both the verification link and the 4-digit code expire 10 minutes after creation. Expired tokens/codes return an error with a message to re-register.

### The `paymentSent` status

The `status: "paymentSent"` value is the authoritative marker that funds have been sent. It is set only after a successful NOWPayments payout. This status is what the global duplicate checks query against -- it ensures that once a user has received funds for *any* campaign, the same email or wallet address cannot be used again in any future campaign.

## Gmail Integration

Email sending uses the same approach as `edge-autobot-server`: nodemailer with Gmail SMTP and an App Password.

### Config additions (`config.json`)

```jsonc
{
  // ... existing fields ...
  "gmailAddress": "rewards@edge.app",
  "gmailAppPassword": "xxxx xxxx xxxx xxxx"
}
```

### Verification email content

- **From**: The configured Gmail address.
- **Subject**: `Verify your email for Edge Rewards`
- **Body**: Plain text containing **both** the 4-digit code and a clickable link:

```
Thanks for registering for Edge Rewards!

Your verification code is: 4829

Enter this code on the verification page, or click the link below:

https://rewards.edge.app/api/rewards/verify?token={verificationToken}

This code and link expire in 10 minutes.
```

## Exchange Rate Lookup

At payout time, the server converts the campaign's `usdAmount` to the equivalent crypto amount using the Edge rates server v3 API.

### Rate server URLs (hardcoded with fallback)

The rate server URLs are hardcoded in `ratesService.ts`. The server tries each URL in order. If the first returns a non-200 response or times out (5 second timeout), fall back to the next.

```ts
const RATES_SERVER_URLS = [
  'https://rates1.edge.app',
  'https://rates2.edge.app'
]
```

### API endpoint

```
POST /v3/rates
```

The v3 API uses `pluginId` and `tokenId` to identify assets (not ticker symbols). This is why the campaign document includes a `currencyPluginId` field.

**Example request:**

```bash
curl -X POST https://rates1.edge.app/v3/rates \
  -H "Content-Type: application/json" \
  -d '{
    "targetFiat": "USD",
    "crypto": [
      {
        "asset": {
          "pluginId": "bitcoin",
          "tokenId": null
        }
      }
    ],
    "fiat": []
  }'
```

**Example response:**

```json
{
  "targetFiat": "USD",
  "crypto": [
    {
      "isoDate": "2026-02-05T12:00:00.000Z",
      "asset": {
        "pluginId": "bitcoin",
        "tokenId": null
      },
      "rate": 97500.12
    }
  ],
  "fiat": []
}
```

The `rate` is the price of 1 unit of the crypto in USD (e.g. 1 BTC = $97,500.12). If the rate is not found, the `rate` field will be absent or undefined.

### Request body format

```ts
interface RatesRequest {
  targetFiat: string             // "USD"
  crypto: Array<{
    asset: {
      pluginId: string           // from campaign.currencyPluginId
      tokenId: string | null     // null for native coins
    }
    isoDate?: string             // optional; defaults to current time
  }>
  fiat: Array<{                  // empty array for our use case
    fiatCode: string
    isoDate?: string
  }>
}
```

### Conversion formula

```
cryptoAmount = usdAmount / rate
```

For example, if `usdAmount` is `"5.00"` and the BTC rate is `97500.12`:

```
cryptoAmount = 5.00 / 97500.12 = 0.00005128 BTC
```

Use string-based arbitrary precision math (e.g. `biggystring` which is already a dependency) to avoid floating-point errors. Round the result to 8 decimal places for BTC-like assets.

### Error handling

- If **all** rate server URLs fail, the payout cannot proceed. Log the error, store a failure status on the record, and show the user a message that payout processing is delayed.
- If the response's `crypto[0].rate` is absent or undefined, treat it as a rate lookup failure.

## Crypto Payout via NOWPayments API

Payouts are sent using the [NOWPayments Mass Payouts API](https://documenter.getpostman.com/view/7907941/2s93JusNJt).

### Config addition (`config.json`)

```jsonc
{
  // ... existing fields ...
  "nowPaymentsApiKey": "your-api-key-here"
}
```

### Payout flow

The payout flow is the same regardless of which verification method was used (4-digit code or email link):

1. After the verification is validated (not expired, not already used):
   - Set `status` to `"verified"`.
   - Look up the campaign to get the `currencyPluginId` and `ticker`.
   - **Fetch the current exchange rate** from the rates server (with fallback). Convert `usdAmount` to `cryptoAmount`.
   - Store `exchangeRate` and `cryptoAmount` on the verification record for audit.
   - Call the NOWPayments payout endpoint with the `ticker`, `cryptoAmount`, and `walletAddress`.
   - On payout success: store the returned `payoutId` and `payoutStatus`, then set `status` to `"paymentSent"`.
   - On payout failure: log the error, store the failure status. Status remains `"verified"` (so the failure point is clear and the user can potentially retry or be manually resolved).
2. The thank-you page should still render but indicate that payout processing may be delayed if the rate lookup or payout API call failed.

### NOWPayments API reference

- **Auth**: `x-api-key` header with the API key from config.
- **Endpoint**: `POST https://api.nowpayments.io/v1/payout` (see official docs for current endpoint).
- **Key fields**: `address`, `currency`, `amount` (the calculated `cryptoAmount`).

## API Routes

| Method | Path                        | Description                                    |
| ------ | --------------------------- | ---------------------------------------------- |
| GET    | `/rewards`                  | Landing page (serves the React SPA).           |
| POST   | `/api/rewards/register`     | Submit email + CAPTCHA for a campaign.         |
| POST   | `/api/rewards/verify-code`  | Verify via 4-digit code (Method A).            |
| GET    | `/api/rewards/verify`       | Verify via email link click (Method B).        |

### `POST /api/rewards/register`

**Request body:**

```json
{
  "email": "user@example.com",
  "data": "ZWRnZXJld2FyZHN8YmMx...",
  "captchaToken": "prosopo-token"
}
```

**Server-side validation order:**

1. Validate CAPTCHA token.
2. Validate email format (server-side re-check).
3. Compute `normalizedEmail` from the submitted email (lowercase, strip `+` suffix, strip dots from local part).
4. Decode and validate `data` param.
5. Global duplicate check: `normalizedEmail` not in any `status: "paymentSent"` record.
6. Global duplicate check: `walletAddress` not in any `status: "paymentSent"` record.
7. Per-campaign duplicate check: `normalizedEmail` not already pending/verified for this campaign.
8. Search for an active campaign matching the `ticker` from the decoded data.
9. Generate `verificationToken` (long random string) and `verificationCode` (4-digit zero-padded).
10. Create verification record with `status: "created"` (storing `email`, `normalizedEmail`, `usdAmount` from campaign).
11. Send email to the original `email` address containing both the code and the link. On success, update `status` to `"emailSent"`.

**Success response (200):**

```json
{
  "success": true,
  "message": "Verification email sent",
  "verificationId": "btc-launch-2026:1738780800000:abc123"
}
```

The `verificationId` is returned so the client can submit the 4-digit code against the correct record.

**Error responses:**

- `400` -- Invalid email format, invalid data param, missing fields.
- `403` -- CAPTCHA validation failed.
- `404` -- No active campaign for the given ticker.
- `409` -- Email or wallet address already used (globally or within this campaign).

### `POST /api/rewards/verify-code`

**Request body:**

```json
{
  "verificationId": "btc-launch-2026:1738780800000:abc123",
  "code": "4829"
}
```

**Server-side validation:**

1. Look up record by `verificationId` (`_id`).
2. Check that `status` is `"emailSent"` (not already verified or paid).
3. Check that `verificationCode` matches the submitted `code`.
4. Check that `expiresAt` has not passed.
5. On success: trigger the payout flow (same as Method B).

**Success response (200):**

```json
{ "success": true, "message": "Email verified, reward is being sent" }
```

**Error responses:**

- `400` -- Missing fields or invalid code format (not 4 digits).
- `404` -- Verification record not found.
- `409` -- Already verified or payment already sent (status is not `"emailSent"`).
- `410` -- Code expired.

### `GET /api/rewards/verify?token={token}`

**Success**: Renders a server-side thank-you HTML page confirming the reward is being sent.

**Error cases**:

- Token not found -> error page.
- Token expired (>10 min) -> error page with "link expired, please register again."
- Status is not `"emailSent"` (already verified or paid) -> error page with "already verified."

## Client Pages

The React SPA at `/rewards` handles three views, switched via React Router:

1. **Email form** (`/rewards`) -- on mount, reads and hides the `data` query param (see [Data Param Handling](#data-param-handling--url-hiding)). Shows email input, Prosopo CAPTCHA, submit button. The `data` value is stored in a hidden form field.
2. **Code entry** (`/rewards/verify`) -- shown after successful email submission. Displays a 4-digit code input and a message to check their email. Also shows a note that they can click the link in the email instead. On successful code submission, navigates to the in-app thank-you view.
3. **Thank you (in-app)** (`/rewards/success`) -- shown after successful code verification via Method A.

The **thank-you page for Method B** (email link click) is rendered server-side at `/api/rewards/verify` and is not part of the SPA.

## Implementation Order

### Step 1: Refactor existing raffle code (prerequisite)

The current `src/server/index.ts` is a single monolithic file containing all Express routes, database initialization, CAPTCHA validation, and business logic for the raffle feature. Before adding the rewards code, this file must be refactored into a modular structure so that each feature owns its own routes and database logic.

**Refactor tasks:**

1. Extract raffle routes into `src/server/raffle/raffleRoutes.ts` (the `POST /api/addEntry` and `GET /api/getEntries` handlers).
2. Extract raffle database initialization and queries into `src/server/raffle/raffleDatabase.ts`.
3. Extract CAPTCHA validation into a shared utility at `src/server/shared/captchaService.ts` (used by both raffle and rewards).
4. Reduce `src/server/index.ts` to a thin Express app setup that:
   - Creates the Express app with middleware (CORS, JSON parsing, static files).
   - Mounts the raffle routes (`app.use(raffleRoutes)`).
   - Mounts the rewards routes (`app.use(rewardsRoutes)`) -- added in Step 2.
   - Starts the server.
5. Verify the raffle feature still works identically after the refactor.

**This refactor must be completed and tested before any rewards code is added.**

### Step 2: Add rewards feature

Once the refactor is complete, add the rewards feature as a parallel module:

```
src/
  server/
    index.ts                  # Thin Express app setup, mounts route modules
    shared/
      captchaService.ts       # Prosopo CAPTCHA validation (shared)
    raffle/
      raffleRoutes.ts         # Raffle Express routes
      raffleDatabase.ts       # Raffle CouchDB init, indexes, queries
    rewards/
      rewardsRoutes.ts        # Rewards Express routes for /api/rewards/*
      emailService.ts         # Gmail SMTP send logic
      ratesService.ts         # Exchange rate lookup with fallback
      nowPaymentsService.ts   # NOWPayments payout logic
      rewardsDatabase.ts      # Rewards CouchDB init, indexes, queries
  client/
    components/
      RaffleEntry.tsx         # Existing raffle form (unchanged)
      Header.tsx              # Existing header (unchanged)
      RewardsEntry.tsx        # Email form + CAPTCHA + hidden data field
      VerifyCode.tsx          # 4-digit code entry screen
      RewardsSuccess.tsx      # In-app thank-you page (after code verification)
  common/
    types.ts                  # Existing raffle types (unchanged)
    rewardsTypes.ts           # Rewards types, cleaners, email validation + normalization
```

## Config Summary

All new configuration values go into the existing `config.json`:

```jsonc
{
  "couchDbFullpath": "http://admin:admin@127.0.0.1:5984",
  "raffleId": "monerokon",
  "prosopoApiKey": "...",
  "prosopoProviderUrl": "",
  "gmailAddress": "rewards@edge.app",
  "gmailAppPassword": "xxxx xxxx xxxx xxxx",
  "nowPaymentsApiKey": "your-api-key-here"
}
```

The `prosopoApiKey` and `prosopoSiteKey` (in `clientConfig.json`) are shared with the existing raffle feature.

https://edge.app/rewards/?data=ZWRnZXJld2FyZHN8YmMxcXZyaHV3YWpka2Y3MDh1bWNrbTZ4Nnd0bndqM3BzMHo5dWZyZGZqfEJUQw==
