import Link from "next/link";
import { OtpFlow } from "@/components/OtpFlow";

export const metadata = { title: "Sign in — StayKit" };

export default function SignInPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <div className="mark">S</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>StayKit</div>
        </div>
        <h1>Sign in to your workspace</h1>
        <div className="sub">Owners, managers and front-desk staff sign in with a one-time code.</div>
        <OtpFlow mode="staff" successHref="/dashboard" />
        <div style={{ marginTop: 18, fontSize: 12.5, color: "var(--muted)", textAlign: "center" }}>
          Are you a guest? <Link href="/my" style={{ color: "var(--brand)", fontWeight: 550 }}>View your booking</Link>
        </div>
      </div>
    </div>
  );
}
