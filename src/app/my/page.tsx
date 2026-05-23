import { redirect } from "next/navigation";
import { getGuestSession } from "@/lib/auth/session";
import { OtpFlow } from "@/components/OtpFlow";

export const metadata = { title: "Your booking — StayKit" };
export const dynamic = "force-dynamic";

export default async function GuestEntry() {
  const session = await getGuestSession();
  if (session) redirect("/my/bookings");

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <div className="mark">S</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>StayKit</div>
        </div>
        <h1>View your booking</h1>
        <div className="sub">
          No password, no app. Sign in with the mobile number on your booking.
        </div>
        <OtpFlow mode="guest" successHref="/my/bookings" compact />
      </div>
    </div>
  );
}
