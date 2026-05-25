"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "../auth/context";
import { assertAccess } from "../rbac/policy";
import { prisma } from "../db";
import { writeAudit } from "../audit";
import { saveFile, deleteStoredFile } from "../storage";
import { type ActionResult, ok, fail, failFrom } from "./result";

const ID_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_ID_BYTES = 8 * 1024 * 1024;

export async function toggleMarketingConsentAction(guestId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "bookings:write");
    const g = await prisma.guest.findFirst({ where: { id: guestId, ownerId: ctx.ownerId } });
    if (!g) return fail("Guest not found.");
    const next = !g.marketingConsent;
    await prisma.guest.update({
      where: { id: guestId },
      data: { marketingConsent: next, dpdpConsentAt: next ? new Date() : g.dpdpConsentAt },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: next ? "CONSENT_GRANTED" : "CONSENT_WITHDRAWN",
      entityType: "Guest",
      entityId: guestId,
      summary: `${next ? "opted in" : "opted out"} ${g.name} for marketing`,
    });
    revalidatePath(`/guests/${guestId}`);
    revalidatePath("/guests");
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}

const editSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export async function updateGuestAction(
  guestId: string,
  input: z.input<typeof editSchema>,
): Promise<ActionResult> {
  try {
    const data = editSchema.parse(input);
    const ctx = await requireContext();
    assertAccess(ctx, "bookings:write");
    const g = await prisma.guest.findFirst({ where: { id: guestId, ownerId: ctx.ownerId } });
    if (!g) return fail("Guest not found.");
    await prisma.guest.update({
      where: { id: guestId },
      data: {
        name: data.name,
        email: data.email || null,
        city: data.city || null,
        state: data.state || null,
        notes: data.notes || null,
      },
    });
    revalidatePath(`/guests/${guestId}`);
    return ok();
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e);
  }
}

const crmSchema = z.object({
  vip: z.boolean().optional(),
  blacklisted: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

/** Update CRM flags/tags on a guest (audit P2 #25): VIP, do-not-book, and free-text tags. */
export async function setGuestCrmAction(
  guestId: string,
  input: z.input<typeof crmSchema>,
): Promise<ActionResult> {
  try {
    const data = crmSchema.parse(input);
    const ctx = await requireContext();
    assertAccess(ctx, "bookings:write");
    const g = await prisma.guest.findFirst({ where: { id: guestId, ownerId: ctx.ownerId } });
    if (!g) return fail("Guest not found.");
    const tags = data.tags
      ? [...new Set(data.tags.map((t) => t.trim()).filter(Boolean))]
      : undefined;
    await prisma.guest.update({
      where: { id: guestId },
      data: {
        vip: data.vip ?? undefined,
        blacklisted: data.blacklisted ?? undefined,
        ...(tags ? { tags: JSON.stringify(tags) } : {}),
      },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "GUEST_CRM_UPDATED",
      entityType: "Guest",
      entityId: guestId,
      summary: `updated CRM for ${g.name}`,
    });
    revalidatePath(`/guests/${guestId}`);
    revalidatePath("/guests");
    return ok();
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e);
  }
}

/**
 * Upload an encrypted ID document for a guest. Sensitive — requires team:manage.
 * The file is AES-256-GCM encrypted at rest; we keep only the masked last 4 in the DB.
 */
export async function uploadGuestIdAction(guestId: string, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "team:manage");
    const g = await prisma.guest.findFirst({ where: { id: guestId, ownerId: ctx.ownerId } });
    if (!g) return fail("Guest not found.");

    const file = form.get("file");
    if (!(file instanceof File)) return fail("Choose a file to upload.");
    if (!ID_MIMES.includes(file.type)) return fail("Use a JPG, PNG, WEBP or PDF.");
    if (file.size > MAX_ID_BYTES) return fail("File must be under 8 MB.");

    const idType = String(form.get("idType") ?? "") || null;
    const idLast4 = String(form.get("idLast4") ?? "").slice(-4) || null;
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];

    const saved = await saveFile({
      ownerId: ctx.ownerId,
      uploadedById: ctx.userId,
      kind: "GUEST_ID",
      buffer,
      mime: file.type,
      ext,
    });
    // Replace any previous document.
    if (g.idFileId) await deleteStoredFile(g.idFileId);
    await prisma.guest.update({
      where: { id: guestId },
      data: { idFileId: saved.id, idType, idLast4 },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "GUEST_ID_UPLOADED",
      entityType: "Guest",
      entityId: guestId,
      summary: `uploaded ID document (${idType ?? "doc"}) for ${g.name}`,
    });
    revalidatePath(`/guests/${guestId}`);
    return ok(undefined, "ID document uploaded and encrypted.");
  } catch (e) {
    return failFrom(e, "Could not upload the document.");
  }
}

/**
 * DPDP right-to-erasure. If the guest has any non-cancelled booking we must retain
 * financial records (GST 6y / Income Tax 8y), so we *anonymise* the PII instead of
 * hard-deleting. With no such bookings we delete the row outright.
 */
export async function eraseGuestAction(guestId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "team:manage"); // erasure is an owner/admin action
    const g = await prisma.guest.findFirst({
      where: { id: guestId, ownerId: ctx.ownerId },
      include: { _count: { select: { bookings: true } } },
    });
    if (!g) return fail("Guest not found.");

    const billable = await prisma.booking.count({
      where: {
        guests: { some: { guestId } },
        status: { not: "CANCELLED" },
      },
    });

    // Shred the encrypted ID document either way.
    if (g.idFileId) await deleteStoredFile(g.idFileId);

    if (billable > 0) {
      await prisma.guest.update({
        where: { id: guestId },
        data: {
          name: "Erased guest",
          phone: `erased_${guestId}`,
          email: null,
          city: null,
          notes: null,
          idType: null,
          idLast4: null,
          idFileId: null,
          marketingConsent: false,
        },
      });
      await writeAudit({
        ownerId: ctx.ownerId,
        actorType: "USER",
        actorName: ctx.name,
        action: "GUEST_ANONYMISED",
        entityType: "Guest",
        entityId: guestId,
        summary: `anonymised guest PII (retained ${billable} booking record(s) for tax)`,
      });
      revalidatePath("/guests");
      return ok(
        undefined,
        "Personal data erased. Booking/tax records were retained as required by law.",
      );
    }

    await prisma.guest.delete({ where: { id: guestId } });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "GUEST_ERASED",
      entityType: "Guest",
      entityId: guestId,
      summary: `erased guest ${g.name}`,
    });
    revalidatePath("/guests");
    return ok(undefined, "Guest fully erased.");
  } catch (e) {
    return failFrom(e);
  }
}
