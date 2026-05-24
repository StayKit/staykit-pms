import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { Icon } from "@/components/Icon";
import { stateName } from "@/lib/india";
import { PropertyForm } from "@/components/owner/manage/PropertyForm";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const ctx = (await getAppContext())!;
  const properties = await prisma.property.findMany({
    where: { ownerId: ctx.ownerId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { rooms: true, bookings: true } } },
  });

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Properties</h2>
          <div className="sub">
            {properties.length} propert{properties.length === 1 ? "y" : "ies"}
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Property</th>
              <th>Where</th>
              <th>Rooms</th>
              <th>Bookings</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="name">{p.name}</div>
                  <div className="sub">{p.gstin ? `GSTIN ${p.gstin}` : "No GSTIN"}</div>
                </td>
                <td className="text-sm">
                  {p.city}, {stateName(p.state)}
                </td>
                <td>{p._count.rooms}</td>
                <td>{p._count.bookings}</td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Link className="btn btn-sm" href={`/properties/${p.id}/rooms`}>
                      Rooms
                    </Link>
                    <Link className="btn btn-sm" href={`/properties/${p.id}/rate-plans`}>
                      Rates
                    </Link>
                    <Link className="btn btn-sm" href={`/properties/${p.id}/settings`}>
                      Settings
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {properties.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No properties yet — add your first one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <details>
        <summary className="btn btn-primary" style={{ display: "inline-flex", cursor: "pointer" }}>
          <Icon name="plus" className="icon-sm" /> Add a property
        </summary>
        <div style={{ marginTop: 12 }}>
          <PropertyForm />
        </div>
      </details>
    </div>
  );
}
