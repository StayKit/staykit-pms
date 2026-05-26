#!/usr/bin/env node
// StayKit — one-shot tenant bootstrap.
//
// Runs *inside* the container after `prisma db push` has created the schema. It
// inserts the initial Owner row and the first OWNER-role User, then prints the
// login URL the operator should hand to the customer. The customer signs in by
// requesting an OTP at /login the normal way (no magic link, no shortcut).
//
// Safety: refuses to run if any Owner already exists in the DB.
//
//   docker compose exec app node /app/bin/bootstrap-tenant.mjs \
//     --name "Acme Homestays" \
//     --phone "+919876543210" \
//     --email "ops@acme.in"
//
// DATABASE_URL is read from the environment (set by docker-compose to the
// in-volume SQLite path).

import { PrismaClient } from "@prisma/client";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    out[key] = val;
  }
  return out;
}

function fail(msg, code = 1) {
  console.error(`[bootstrap-tenant] ${msg}`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));
const name = args.name?.trim();
const phone = args.phone?.trim();
const email = args.email?.trim() || null;

if (!name || !phone) {
  fail("Usage: bootstrap-tenant.mjs --name <owner-display-name> --phone <+E164> [--email <addr>]");
}
if (!/^\+\d{8,15}$/.test(phone)) {
  fail(`Phone must be E.164 (e.g. +919876543210). Got: ${phone}`);
}
if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail(`Email looks malformed: ${email}`);
}

const prisma = new PrismaClient();

try {
  const existing = await prisma.owner.count();
  if (existing > 0) {
    fail(
      `Refusing to bootstrap: this DB already has ${existing} Owner row(s). Bootstrap is one-shot.`,
      2,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const owner = await tx.owner.create({
      data: { name, phone, email },
    });
    const user = await tx.user.create({
      data: {
        ownerId: owner.id,
        name,
        phone,
        email,
        role: "OWNER",
        active: true,
      },
    });
    return { owner, user };
  });

  const baseUrl = process.env.APP_BASE_URL || "(set APP_BASE_URL)";
  console.log("");
  console.log(`[bootstrap-tenant] Owner created: ${result.owner.id}`);
  console.log(`[bootstrap-tenant] Admin User created: ${result.user.id} (role=OWNER)`);
  console.log("");
  console.log(`  Display name : ${name}`);
  console.log(`  Login phone  : ${phone}`);
  console.log(`  Login email  : ${email ?? "(none)"}`);
  console.log(`  Login URL    : ${baseUrl}/login`);
  console.log("");
  console.log("  Customer signs in by entering the phone above at /login and confirming the OTP");
  console.log("  delivered via the configured channel (MSG91/Resend/console). If no provider is");
  console.log("  configured, the OTP code is printed to the app container's stdout.");
  console.log("");
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await prisma.$disconnect();
}
