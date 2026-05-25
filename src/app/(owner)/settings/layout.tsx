import { SettingsNav } from "@/components/owner/settings/SettingsNav";

/** Shared chrome for every Settings sub-page: header + a 240px sub-nav rail. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Settings</h2>
          <div className="sub">Workspace, integrations and team</div>
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, alignItems: "start" }}
      >
        <SettingsNav />
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
