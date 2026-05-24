import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { PropertyTabs } from "@/components/owner/manage/PropertyTabs";
import { PropertyForm } from "@/components/owner/manage/PropertyForm";

export const dynamic = "force-dynamic";

export default async function PropertySettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = (await getAppContext())!;
  const { id } = await params;
  const p = await prisma.property.findFirst({ where: { id, ownerId: ctx.ownerId } });
  if (!p) notFound();

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 22 }}>{p.name}</h2>
      <PropertyTabs propertyId={id} active="settings" />
      <PropertyForm
        id={id}
        initial={{
          name: p.name,
          addressLine1: p.addressLine1,
          addressLine2: p.addressLine2 ?? "",
          city: p.city,
          state: p.state,
          pincode: p.pincode,
          gstin: p.gstin ?? "",
          checkInTime: p.checkInTime,
          checkOutTime: p.checkOutTime,
          cancellationPolicy: p.cancellationPolicy ?? "",
          paymentInstructions: p.paymentInstructions ?? "",
          invoicePrefix: p.invoicePrefix,
        }}
      />
    </div>
  );
}
