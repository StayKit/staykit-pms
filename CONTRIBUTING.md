# Contributing to StayKit

Thanks for helping build an open homestay PMS for Indian owners! 🎉

## Dev setup

```bash
npm install
cp .env.example .env
npm run setup     # prisma generate + db push + seed
npm run dev
```

- Node 20+ (tested on 22), npm.
- The app runs fully in **mock mode** without any third-party credentials: payment links are fake,
  notifications log to the console, and OTP codes are printed to the terminal.

## Before you open a PR

```bash
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run build       # next build must pass
```

## Code style & conventions

- **TypeScript everywhere.** Prefer pure functions in `src/lib/` for business logic.
- **Money is integer paise.** Never store or pass rupees; format with `lib/money.ts`.
- **Regulatory constants** belong in `src/lib/config/` with a `docs/compliance/*` note citing the source.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…).
- **DCO, not CLA.** Sign off every commit: `git commit -s`. By signing off you certify the
  [Developer Certificate of Origin](https://developercertificate.org/).

## Good first issues

- A new SMS/WhatsApp/email **provider adapter** behind `lib/notify/providers.ts`.
- A new **notification trigger** + default template.
- **Translations** — add a locale catalog (Hindi, Kannada, Malayalam, Marathi, Tamil).
- A **state-registration helper** under `docs/compliance/`.

## Reporting bugs / security

File an issue for bugs. For **security** vulnerabilities, follow [SECURITY.md](SECURITY.md) — please
do not open a public issue.
