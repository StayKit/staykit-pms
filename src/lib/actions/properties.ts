"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "../auth/context";
import { assertAccess } from "../rbac/policy";
import { prisma } from "../db";
import { writeAudit } from "../audit";
import { type ActionResult, ok, fail, failFrom } from "./result";
import { assertOwnedProperty } from "./guards";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;

const propertySchema = z.object({
  name: z.string().min(1, "Property name is required"),
  addressLine1: z.string().min(1, "Address is required"),
  addressLine2: z.string().optional().or(z.literal("")),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required"),
  pincode: z.string().regex(/^[0-9]{6}$/, "Pincode must be 6 digits"),
  gstin: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || GSTIN_RE.test(v), "That doesn't look like a valid GSTIN"),
  checkInTime: z.string().default("14:00"),
  checkOutTime: z.string().default("11:00"),
  cancellationPolicy: z.string().optional().or(z.literal("")),
  paymentInstructions: z.string().optional().or(z.literal("")),
  invoicePrefix: z.string().default("INV"),
});

export async function createPropertyAction(
  input: z.input<typeof propertySchema>,
): Promise<ActionResult> {
  try {
    const data = propertySchema.parse(input);
    const ctx = await requireContext();
    assertAccess(ctx, "properties:write");
    const property = await prisma.property.create({
      data: {
        ownerId: ctx.ownerId,
        name: data.name,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        gstin: data.gstin || null,
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
        cancellationPolicy: data.cancellationPolicy || null,
        paymentInstructions: data.paymentInstructions || null,
        invoicePrefix: data.invoicePrefix || "INV",
      },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "PROPERTY_CREATED",
      entityType: "Property",
      entityId: property.id,
      summary: `created property ${data.name}`,
    });
    revalidatePath("/properties");
    return ok({ id: property.id });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e, "Could not create the property.");
  }
}

export async function updatePropertyAction(
  id: string,
  input: z.input<typeof propertySchema>,
): Promise<ActionResult> {
  try {
    const data = propertySchema.parse(input);
    const ctx = await requireContext();
    await assertOwnedProperty(ctx, id, "properties:write");
    await prisma.property.update({
      where: { id },
      data: {
        name: data.name,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        gstin: data.gstin || null,
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
        cancellationPolicy: data.cancellationPolicy || null,
        paymentInstructions: data.paymentInstructions || null,
        invoicePrefix: data.invoicePrefix || "INV",
      },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "PROPERTY_UPDATED",
      entityType: "Property",
      entityId: id,
      summary: `updated property ${data.name}`,
    });
    revalidatePath("/properties");
    revalidatePath(`/properties/${id}/settings`);
    return ok();
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e, "Could not update the property.");
  }
}
