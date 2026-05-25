"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PropertyForm } from "@/components/owner/manage/PropertyForm";
import { seedDefaultTemplatesAction } from "@/lib/actions/notifications";

export interface OnboardingState {
  propertyId: string | null;
  propertyName: string | null;
  roomCount: number;
  ratePlanCount: number;
  templateCount: number;
  razorpayConfigured: boolean;
}

function StepHead({ n, title, done }: Readonly<{ n: number; title: string; done: boolean }>) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: done ? "var(--st-checkedin, #81B29A)" : "var(--line)",
          color: done ? "#fff" : "var(--ink-2)",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {done ? <Icon name="check" className="icon-sm" /> : n}
      </span>
      <h4 style={{ margin: 0 }}>{title}</h4>
    </div>
  );
}

function Why({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--muted)" }}>
        Why we ask this
      </summary>
      <div className="text-sm" style={{ color: "var(--ink-2)", marginTop: 6 }}>
        {children}
      </div>
    </details>
  );
}

export function OnboardingWizard({ state }: Readonly<{ state: OnboardingState }>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const steps = [
    !!state.propertyId,
    state.roomCount > 0,
    state.ratePlanCount > 0,
    state.razorpayConfigured,
    state.templateCount > 0,
  ];
  const done = steps.filter(Boolean).length;
  const pct = Math.round((done / steps.length) * 100);
  const pid = state.propertyId;

  return (
    <div className="page" style={{ paddingTop: 24, maxWidth: 720 }}>
      <h2 style={{ fontSize: 24, marginBottom: 4 }}>Welcome to StayKit</h2>
      <div className="sub" style={{ marginBottom: 16 }}>
        Five quick steps to get your homestay running. {done}/5 done.
      </div>
      <div
        style={{
          height: 8,
          background: "var(--line)",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand)" }} />
      </div>

      {/* Step 1 — property */}
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <StepHead n={1} title="Add your property" done={steps[0]} />
        <Why>
          We use your state and GSTIN to apply the right GST treatment. Skip GSTIN if your turnover
          is under ₹20 lakh (₹10 lakh in HP, Uttarakhand and the Northeast).
        </Why>
        {!pid ? (
          <div style={{ marginTop: 12 }}>
            <PropertyForm onCreated={() => router.refresh()} />
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <span className="pill pill-brand">{state.propertyName}</span>
            <Link className="btn btn-sm" href={`/properties/${pid}/settings`}>
              Edit
            </Link>
          </div>
        )}
      </div>

      {/* Step 2 — rooms */}
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <StepHead n={2} title="Add room types & rooms" done={steps[1]} />
        <Why>
          Rooms power the tape chart and prevent double-bookings (one booking per room per night).
        </Why>
        <div style={{ marginTop: 10 }}>
          {pid ? (
            <Link className="btn btn-primary btn-sm" href={`/properties/${pid}/rooms`}>
              {state.roomCount > 0 ? `Manage rooms (${state.roomCount})` : "Add rooms"}
            </Link>
          ) : (
            <span className="text-sm text-muted">Add a property first.</span>
          )}
        </div>
      </div>

      {/* Step 3 — rate plans */}
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <StepHead n={3} title="Set up rate plans (optional)" done={steps[2]} />
        <Why>Seasonal pricing overrides the base rate. Skip for now — bookings use base rates.</Why>
        <div style={{ marginTop: 10 }}>
          {pid && (
            <Link className="btn btn-sm" href={`/properties/${pid}/rate-plans`}>
              {state.ratePlanCount > 0
                ? `Manage plans (${state.ratePlanCount})`
                : "Add a rate plan"}
            </Link>
          )}
        </div>
      </div>

      {/* Step 4 — payments */}
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <StepHead n={4} title="Connect Razorpay" done={steps[3]} />
        <Why>
          Payment links let guests pay remotely. Until you add keys, StayKit runs in demo mode and
          generates mock links so you can try the flow.
        </Why>
        <div style={{ marginTop: 10 }}>
          {state.razorpayConfigured ? (
            <span className="pill pill-brand">Razorpay connected</span>
          ) : (
            <Link className="btn btn-sm" href="/settings/integrations">
              Add Razorpay keys
            </Link>
          )}
        </div>
      </div>

      {/* Step 5 — notifications */}
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <StepHead n={5} title="Set up guest messages" done={steps[4]} />
        <Why>Pre-built SMS & email templates for confirmations, payment links, and reminders.</Why>
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          {state.templateCount > 0 ? (
            <>
              <span className="pill pill-brand">{state.templateCount} templates ready</span>
              <Link className="btn btn-sm" href="/notifications">
                Review
              </Link>
            </>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await seedDefaultTemplatesAction();
                  setMsg(res.message ?? null);
                  router.refresh();
                })
              }
            >
              Add default templates
            </button>
          )}
        </div>
      </div>

      {done === 5 && (
        <Link className="btn btn-primary btn-lg" href="/dashboard">
          <Icon name="arrow-right" className="icon-sm" /> Go to dashboard
        </Link>
      )}
      {msg && (
        <div className="dev-code" style={{ marginTop: 12 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
