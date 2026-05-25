"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import {
  createTeamMemberAction,
  updateTeamMemberAction,
  toggleTeamMemberActiveAction,
  inviteTeamMemberAction,
} from "@/lib/actions/team";
import type { Role } from "@/lib/rbac/policy";

export interface TeamRow {
  id: string;
  name: string;
  phone: string;
  role: Role;
  active: boolean;
  scopeIds: string[];
  isSelf: boolean;
}

const ROLE_HELP: Record<Role, string> = {
  OWNER: "Full access to everything.",
  MANAGER: "Operate assigned properties incl. refunds & rates.",
  STAFF: "Front-desk: bookings & check-in only.",
};

export function TeamManager({
  members,
  properties,
}: Readonly<{ members: TeamRow[]; properties: { id: string; name: string }[] }>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [scopes, setScopes] = useState<string[]>([]);

  function toggleScope(id: string) {
    setScopes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function add() {
    start(async () => {
      const res = await createTeamMemberAction({ name, phone, role, propertyIds: scopes });
      setMsg(res.message ?? (res.ok ? "Team member added." : "Could not add."));
      if (res.ok) {
        setName("");
        setPhone("");
        setScopes([]);
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>Add a team member</h4>
        <div className="field-row">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Mobile (used for OTP login)</label>
            <input value={phone} placeholder="+9198…" onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="OWNER">Owner</option>
            <option value="MANAGER">Manager</option>
            <option value="STAFF">Front desk / staff</option>
          </select>
          <div className="text-xs text-muted" style={{ marginTop: 4 }}>
            {ROLE_HELP[role]}
          </div>
        </div>
        {role !== "OWNER" && properties.length > 0 && (
          <div className="field">
            <label>Property access</label>
            <div className="chips">
              {properties.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={"chip" + (scopes.includes(p.id) ? " selected" : "")}
                  onClick={() => toggleScope(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          className="btn btn-primary"
          disabled={pending || !name.trim() || !phone.trim()}
          onClick={add}
        >
          <Icon name="user-plus" className="icon-sm" /> Add member
        </button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Properties</th>
              <th>Status</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="name">{m.name}</div>
                  <div className="sub tabular">{m.phone}</div>
                </td>
                <td>
                  <select
                    value={m.role}
                    disabled={pending || m.isSelf}
                    onChange={(e) =>
                      start(async () => {
                        await updateTeamMemberAction(m.id, {
                          role: e.target.value as Role,
                          propertyIds: m.scopeIds,
                        });
                        router.refresh();
                      })
                    }
                  >
                    <option value="OWNER">Owner</option>
                    <option value="MANAGER">Manager</option>
                    <option value="STAFF">Staff</option>
                  </select>
                </td>
                <td className="text-sm">
                  {m.role === "OWNER" ? "All" : m.scopeIds.length ? `${m.scopeIds.length}` : "None"}
                </td>
                <td>
                  {m.active ? (
                    <span className="pill pill-brand">Active</span>
                  ) : (
                    <span className="pill pill-neutral">Disabled</span>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="btn btn-sm"
                    disabled={pending}
                    title="Send a sign-in invite"
                    onClick={() =>
                      start(async () => {
                        const res = await inviteTeamMemberAction(m.id);
                        setMsg(res.message ?? (res.ok ? "Invite sent." : "Could not send invite."));
                        router.refresh();
                      })
                    }
                  >
                    <Icon name="send" className="icon-sm" /> Invite
                  </button>
                  {!m.isSelf && (
                    <button
                      className="btn btn-sm"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await toggleTeamMemberActiveAction(m.id);
                          setMsg(res.message ?? "Updated.");
                          router.refresh();
                        })
                      }
                    >
                      {m.active ? "Disable" : "Enable"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <Toast message={msg} onClose={() => setMsg(null)} timeout={6000} />}
    </>
  );
}
