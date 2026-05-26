"use server";

import { getAppContext } from "@/lib/auth/context";
import { loadBookingDetail } from "@/lib/booking/detail";
import type { BookingDetailData } from "@/components/owner/BookingDetailView";

export async function fetchBookingDetailAction(
  id: string,
): Promise<{ ok: true; data: BookingDetailData } | { ok: false; message: string }> {
  const ctx = await getAppContext();
  if (!ctx) return { ok: false, message: "Not signed in" };
  const data = await loadBookingDetail(id, ctx.ownerId);
  if (!data) return { ok: false, message: "Booking not found" };
  return { ok: true, data };
}
