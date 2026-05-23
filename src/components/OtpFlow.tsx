"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  requestStaffOtp,
  verifyStaffOtp,
  requestGuestOtp,
  verifyGuestOtp,
} from "@/lib/actions/auth";

export function OtpFlow({
  mode,
  successHref,
  compact,
}: {
  mode: "staff" | "guest";
  successHref: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const requestFn = mode === "staff" ? requestStaffOtp : requestGuestOtp;
  const verifyFn = mode === "staff" ? verifyStaffOtp : verifyGuestOtp;

  async function sendCode() {
    setPending(true);
    setError(null);
    const res = await requestFn(phone);
    setPending(false);
    if (res.ok && res.requestId) {
      setRequestId(res.requestId);
      setDevCode(res.devCode ?? null);
      setStep("otp");
    } else {
      setError(res.message ?? "Could not send a code.");
    }
  }

  async function verify() {
    if (!requestId) return;
    setPending(true);
    setError(null);
    const res = await verifyFn(requestId, code);
    setPending(false);
    if (res.ok) {
      router.push(successHref);
      router.refresh();
    } else {
      setError(res.message ?? "Verification failed.");
    }
  }

  if (step === "phone") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendCode();
        }}
      >
        <div className="field">
          <label>Mobile number</label>
          <input
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 98xxx xxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoFocus
          />
          <div className="hint">
            {mode === "staff"
              ? "Use the number on your staff account."
              : "Use the number on your booking."}
          </div>
        </div>
        {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
        <button
          className="btn btn-primary btn-lg"
          style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
          disabled={pending || phone.length < 5}
        >
          {pending ? "Sending…" : "Continue"} <Icon name="arrow-right" className="icon-sm" />
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        verify();
      }}
    >
      <div style={{ fontSize: compact ? 16 : 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
        Enter the 6-digit code
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
        We&apos;ve sent it to <b>{phone}</b>.
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          style={{ letterSpacing: "0.5em", textAlign: "center", fontSize: 20, fontWeight: 600 }}
          autoFocus
        />
      </div>
      {devCode && (
        <div className="dev-code">Dev mode: your code is <b>{devCode}</b> (sent via SMS in production).</div>
      )}
      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
      <button
        className="btn btn-primary btn-lg"
        style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
        disabled={pending || code.length < 6}
      >
        {pending ? "Verifying…" : "Verify & continue"}
      </button>
      <div style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center", marginTop: 14 }}>
        Didn&apos;t get it?{" "}
        <button type="button" className="btn-ghost" style={{ color: "var(--brand)", fontWeight: 550, padding: 0, border: 0, cursor: "pointer" }} onClick={sendCode}>
          Resend code
        </button>
      </div>
    </form>
  );
}
