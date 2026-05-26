import { notFound } from "next/navigation";
import { getAppContext } from "@/lib/auth/context";
import { loadBookingDetail } from "@/lib/booking/detail";
import { BookingDetailView } from "@/components/owner/BookingDetailView";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const ctx = (await getAppContext())!;
  const { id } = await params;
  const data = await loadBookingDetail(id, ctx.ownerId);
  if (!data) notFound();
  return <BookingDetailView data={data} />;
}
