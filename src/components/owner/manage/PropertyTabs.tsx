import Link from "next/link";

const TABS = [
  { key: "rooms", label: "Rooms" },
  { key: "rate-plans", label: "Rate plans" },
  { key: "maintenance", label: "Maintenance" },
  { key: "settings", label: "Settings" },
] as const;

export type PropertyTab = (typeof TABS)[number]["key"];

export function PropertyTabs({
  propertyId,
  active,
}: Readonly<{ propertyId: string; active: PropertyTab }>) {
  return (
    <div className="tabs" style={{ marginBottom: 16 }}>
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/properties/${propertyId}/${t.key}`}
          className={"tab " + (active === t.key ? "active" : "")}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
