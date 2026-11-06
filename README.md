# یونس (Younes Store)

Persian (fa-IR, RTL) storefront and admin panel for heating, cooling, wall-mounted boilers (پکیج), air conditioners (کولر گازی) and refrigeration tools. Prices are shown in Toman.

Scope of this version: catalog, admin panel, media, store settings, phone/OTP login and cart. Checkout, payments, orders, shipping, coupons and reviews are intentionally **not** implemented — the cart's checkout button is disabled with an explanation.

## Stack

- Next.js 16 (App Router, Turbopack, Cache Components, Server Actions, `proxy.ts`)
- React 19, TypeScript (strict), Tailwind CSS v4, Radix primitives, Vazirmatn font
- PostgreSQL + Prisma 7 (`prisma-client` generator → `generated/prisma`, `@prisma/adapter-pg`)
- Zod 4, react-hook-form, Tiptap 3 (rich-text stored as JSON, rendered without raw HTML)
- S3-compatible object storage via AWS SDK v3 presigned uploads
- Vitest (unit + integration against a dedicated `_test` database)

## Requirements

- Node.js 20.9+ and npm
- PostgreSQL 14+ (local or remote)
- An S3-compatible bucket (optional for local development; uploads are disabled without it)

## Installation

```bash
npm install
cp .env.example .env.local   # Next.js reads .env.local
cp .env.example .env         # Prisma CLI and the seed script read .env
```

Edit both files with real values. They are git-ignored — never commit them.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string. Put the password here only, never in code. |
| `SESSION_SECRET` | yes | Random string, at least 32 characters (`openssl rand -base64 48`). |
| `ROOT_ADMIN_PHONE` | for seeding | Iranian mobile of the single root admin, e.g. `09123456789`. |
| `OTP_MODE` | yes | `development` enables the fixed code `123456` (only when `NODE_ENV` ≠ `production`). Use `production` in production. |
| `NEXT_PUBLIC_APP_URL` | yes | Public origin used for canonical URLs, sitemap and JSON-LD. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | for uploads | S3-compatible endpoint, region and bucket. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | for uploads | Server-only credentials; never sent to the browser. |
| `S3_PUBLIC_BASE_URL` | optional | Public/CDN base URL for objects. Defaults to `endpoint/bucket`. Add its host to `images.remotePatterns` in `next.config.ts` if it differs. |
| `S3_FORCE_PATH_STYLE` | optional | `true` for MinIO/ArvanCloud-style path addressing. |

## Database setup

```bash
createdb younes_store                 # once
npm run db:migrate                    # prisma migrate dev — applies/creates versioned migrations (development)
npm run db:seed                       # idempotent seed: default store settings + root admin
```

Production / CI deploys must use versioned migrations only:

```bash
npx prisma migrate deploy
npm run db:seed
```

Do not use `prisma db push` as a substitute for migrations, and never run `prisma migrate reset` against a database that holds real data.

### Root admin seeding

- The seed creates **one** admin from `ROOT_ADMIN_PHONE` only if no admin exists yet. Re-running it is safe.
- If that phone already belongs to a CUSTOMER account, the seed **refuses** to promote it and exits with an error — promotion must be a deliberate manual decision (e.g. a reviewed SQL update).
- There is no public way to create admins: login/registration always creates `CUSTOMER` users, and profile editing cannot change roles.

## Local development

```bash
npm run dev            # http://localhost:3000
```

- Storefront: `/`, `/categories`, `/categories/[slug]`, `/products/[slug]`, `/search`, `/cart`, `/login`, `/account`
- Admin: `/admin` (dashboard), `/admin/products`, `/admin/categories`, `/admin/media`, `/admin/settings`

Log in at `/login` with the `ROOT_ADMIN_PHONE` number and, with `OTP_MODE=development`, the code **123456**. Persian/Arabic digits and `+98` / `0098` prefixes are normalized.

## Authentication behavior

- Phone + OTP. Challenges are stored hashed, expire after 5 minutes, allow 5 attempts, and a new code can be requested once per 60 seconds per phone.
- `OTP_MODE=development` **and** `NODE_ENV` ≠ `production` → fixed code `123456`. In any other case the fixed code is rejected.
- No SMS gateway is integrated yet. In production mode, OTP requests **fail closed** with a Persian "SMS service unavailable" error and no challenge is created. To integrate a gateway, implement the `SmsSender` interface in `features/auth/otp-provider.ts` (`getSmsSender()`).
- Sessions are random tokens stored hashed in the `sessions` table; the raw token lives only in an HttpOnly, `SameSite=Lax`, `Secure` (in production) cookie for 30 days. Logout revokes the session row.
- `proxy.ts` only does an optimistic cookie check; every admin page and every admin Server Action re-verifies the session and `ADMIN` role on the server.
- Guest carts use an HttpOnly cookie token (only its hash is stored) and are merged into the user's cart on login.

## Media / S3 setup

Uploads use presigned `PUT` URLs created by an admin-only Server Action. Allowed types: JPEG, PNG, WebP up to 5 MB. Object keys are generated server-side; deletes go through DB-tracked media records, so arbitrary keys cannot be deleted.

Configure bucket CORS to allow direct browser uploads from your site origin:

```json
[
  {
    "AllowedOrigins": ["https://your-domain.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3000
  }
]
```

Objects must be publicly readable (bucket policy or CDN) at `S3_PUBLIC_BASE_URL`. Without S3 configuration the admin shows a Persian notice and upload buttons are disabled; the rest of the app works.

## Testing

```bash
npm test                    # unit tests (no database needed)
npm run test:integration    # integration tests against PostgreSQL
npm run test:all
npm run typecheck
npm run lint
```

Integration tests run against `younes_store_test` (override with `TEST_DATABASE_URL`). The setup **refuses** any database whose name does not end in `_test`, and truncates all tables before each test. Prepare it once:

```bash
createdb younes_store_test
DATABASE_URL="postgresql://USER@localhost:5432/younes_store_test" npx prisma migrate deploy
```

S3, cookies and Next.js cache APIs are mocked in integration tests; real S3 uploads are not exercised.

## Build and production

```bash
npm run build
npm start
```

Production checklist:

- `NODE_ENV=production`, `OTP_MODE=production`, a strong unique `SESSION_SECRET`, HTTPS origin in `NEXT_PUBLIC_APP_URL`.
- Run `npx prisma migrate deploy` before starting the new release, then `npm run db:seed` once.
- Configure S3 credentials, public URL and CORS as above.
- Integrate an SMS provider before launch — without it nobody can log in in production (by design).

## Project layout

```
app/(store)/        storefront routes
app/admin/          admin panel routes
features/<domain>/  services, Zod schemas and Server Actions (auth, categories, products, cart, media, store-settings, admin)
components/         UI primitives (ui/), storefront, admin, products, cart, shared
lib/                db, env, phone/format helpers, storage (S3), SEO, errors
prisma/             schema, migrations, seed
tests/unit, tests/integration
```
