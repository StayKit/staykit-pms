# StayKit — Settings Build Tracker

The combined read-only `/settings` page shipped with dead buttons (the left sub-nav and every
"Manage" button were inert), and "Team" was wrongly parked under the **Advanced** sidebar group.
This pass turns Settings into a real, routed section built on the existing design system, and
relocates Team into Settings → **Team & roles**.

**Status legend:** ✅ done · 🚧 in progress · ⬜ not started · ⏭️ deferred (documented why)

Last updated: 2026-05-24 — **complete.** `npm test` (510 pass, +23), `next lint`, `tsc`,
`npm run build` all green.

---

## Goals (from the request)

1. **Make the Settings buttons work.** The sub-nav and per-row actions must navigate / act.
2. **Move "Team"** out of the Advanced sidebar group → Settings → "Team & roles".
3. **Build out the missing Settings sub-pages** (Property, Integrations, Team & roles,
   Notifications, Legal & DPDP, Account) in the current design language — no new design assets,
   reuse `globals.css` primitives (`card`, `field`, `tbl`, `pill`, `chip`, `nav-item`, …).

## Approach

- Replace the single `settings/page.tsx` with a **routed section**: a `settings/layout.tsx`
  renders the page header + a real left sub-nav (`SettingsNav`, a client component that
  highlights the active route via `usePathname`) and the active sub-page as children.
- Each sub-nav item is a Next `<Link>` to a sub-route, so deep-links and the browser back button
  work and the active item is highlighted.
- Interactive pieces follow the established client-component + `useTransition` + server-action
  pattern already used by `PropertyForm` / `TeamManager` / `ChannelsManager`.
- Integration secrets stay in the environment (self-hosting model). The Integrations page shows
  **detected status + which env vars to set** — it never displays secret values and has no DB
  key-entry form (deliberate; documented in the prior build's IMPLEMENTATION.md).

---

## Tasks

### A. Routing & navigation

- ✅ `settings/layout.tsx` — header + 240px sub-nav grid wrapper
- ✅ `components/owner/settings/SettingsNav.tsx` — active-aware Link sub-nav
- ✅ `settings/page.tsx` — redirect to `/settings/property` (sensible default)
- ✅ Remove `Team` from the **Advanced** sidebar group (`nav.ts`); deleted the old `/team` route
- ✅ Repoint `revalidatePath("/team")` → `/settings/team` (team action)
- ✅ Repoint onboarding "Add Razorpay keys" → `/settings/integrations`

### B. Sub-pages

- ✅ **Property** (`settings/property`) — editable Property & GST form (reuses `PropertyForm`),
  with a `?property=` switcher when more than one exists; empty state → onboarding
- ✅ **Integrations** (`settings/integrations`) — status cards with a working **Manage** disclosure
  (`<details>`: env-var names + doc pointer + live detection); cash-first note links to payment
  instructions. Secrets never rendered.
- ✅ **Team & roles** (`settings/team`) — relocated team manager (reuses `TeamManager`)
- ✅ **Notifications** (`settings/notifications`) — channel-provider status + per-template
  enable/disable toggles (`NotificationToggles`) + "seed defaults" when empty + link to editor
- ✅ **Legal & DPDP** (`settings/legal`) — compliance dashboard with real numbers (consent counts,
  stored guest-ID files + auto-purge window, encryption-key status, Form C / FRRO, statutory retention)
- ✅ **Account** (`settings/account`) — owner/workspace profile edit (`AccountForm` +
  `updateAccountAction`), signed-in user + role, sign out; form locks for non-owners

### C. Server actions

- ✅ `actions/settings.ts` — `updateAccountAction` (owner name/email/phone, OWNER-gated, audited,
  cross-workspace uniqueness on phone + email)
- ✅ `actions/notifications.ts` — added `/settings/notifications` to revalidation

### D. Tests & verification

- ✅ `actions/settings.test.ts` — account update happy-path + validation + RBAC + uniqueness (5)
- ✅ `pages.test.tsx` — render tests for every new settings sub-page + redirect test; moved the
  old settings-page assertions onto the new sub-pages (9 new)
- ✅ DOM tests for new client components — `SettingsNav` (3), `NotificationToggles` (3),
  `AccountForm` (2)
- ✅ `npm test` (510 pass), `next lint` (clean), `tsc --noEmit` (clean), `npm run build` (green)

### CSS

- ✅ `globals.css` — `.integration` disclosure-row styles (summary marker reset + open state)

---

## Notes / decisions

- No schema changes: every page is built from existing models (Owner, Property, User,
  NotificationTemplate, Guest, FileUpload, AuditLog) and existing actions.
- Topbar title stays "Settings" for all sub-routes (the section header + each sub-page heading
  give context); not worth threading per-subpage titles through `titleForPath`.
