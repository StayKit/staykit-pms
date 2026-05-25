import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { PropertyForm } from "@/components/owner/manage/PropertyForm";

export const dynamic = "force-dynamic";

export default async function SettingsPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const ctx = (await getAppContext())!;
  const { property: selectedId } = await searchParams;

  const properties = await prisma.property.findMany({
    where: { ownerId: ctx.ownerId },
    orderBy: { createdAt: "asc" },
  });

  const property =
    properties.find((p) => p.id === selectedId) ??
    properties.find((p) => p.active) ??
    properties[0];

  return (
    <>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Property &amp; GST</h3>
        <div className="sub">
          Address, GSTIN, check-in/out times and the policies shown to guests. Rooms, rate plans and
          maintenance live under <Link href="/properties">Properties</Link>.
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="card card-padded">
          <div className="empty" style={{ padding: "8px 0 16px" }}>
            You haven&apos;t set up a property yet.
          </div>
          <Link className="btn btn-primary" href="/onboarding">
            Start setup
          </Link>
        </div>
      ) : (
        <>
          {properties.length > 1 && (
            <div className="chips">
              {properties.map((p) => (
                <Link
                  key={p.id}
                  href={`/settings/property?property=${p.id}`}
                  className={"chip" + (p.id === property!.id ? " selected" : "")}
                >
                  {p.name}
                  {!p.active ? " (inactive)" : ""}
                </Link>
              ))}
            </div>
          )}

          <PropertyForm
            id={property!.id}
            initial={{
              name: property!.name,
              addressLine1: property!.addressLine1,
              addressLine2: property!.addressLine2 ?? "",
              city: property!.city,
              state: property!.state,
              pincode: property!.pincode,
              gstin: property!.gstin ?? "",
              checkInTime: property!.checkInTime,
              checkOutTime: property!.checkOutTime,
              cancellationPolicy: property!.cancellationPolicy ?? "",
              paymentInstructions: property!.paymentInstructions ?? "",
              invoicePrefix: property!.invoicePrefix,
            }}
          />
        </>
      )}
    </>
  );
}
