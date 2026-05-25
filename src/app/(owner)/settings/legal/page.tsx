import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { RETENTION, FRRO_FORM_C_URL } from "@/lib/config";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function SettingsLegalPage() {
  const ctx = (await getAppContext())!;

  const [totalGuests, consented, foreignGuests, idFiles, encryptedIdFiles] = await Promise.all([
    prisma.guest.count({ where: { ownerId: ctx.ownerId } }),
    prisma.guest.count({ where: { ownerId: ctx.ownerId, marketingConsent: true } }),
    prisma.guest.count({ where: { ownerId: ctx.ownerId, isForeign: true } }),
    prisma.fileUpload.count({ where: { ownerId: ctx.ownerId, kind: "GUEST_ID" } }),
    prisma.fileUpload.count({ where: { ownerId: ctx.ownerId, kind: "GUEST_ID", encrypted: true } }),
  ]);

  const encryptionKeySet = !!process.env.FILE_ENCRYPTION_KEY;

  const stats = [
    { label: "Guests on file", value: totalGuests },
    { label: "Marketing consent", value: consented },
    { label: "Foreign guests", value: foreignGuests },
    { label: "ID documents stored", value: idFiles },
  ];

  return (
    <>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Legal &amp; DPDP</h3>
        <div className="sub">
          How StayKit handles guest data under India&apos;s DPDP Act, FRRO rules and tax-record law.
        </div>
      </div>

      <div className="kpi-grid">
        {stats.map((s) => (
          <div key={s.label} className="kpi">
            <div className="num tabular">{s.value}</div>
            <div className="label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card card-padded">
        <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>
          <Icon name="lock" className="icon-sm" /> Guest ID documents
        </h4>
        <p className="text-sm text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
          ID scans are encrypted at rest with AES-256-GCM and viewing one writes an audit-log entry.
          They are automatically purged {RETENTION.guestIdDaysAfterCheckout} days after checkout.
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
          <span className="pill pill-neutral">
            {encryptedIdFiles}/{idFiles} encrypted
          </span>
          {encryptionKeySet ? (
            <span className="pill pill-checkedin">
              <Icon name="check" className="icon-sm" /> Encryption key set
            </span>
          ) : (
            <span className="pill pill-tentative">
              <Icon name="alert" className="icon-sm" /> Set FILE_ENCRYPTION_KEY
            </span>
          )}
        </div>
      </div>

      <div className="card card-padded">
        <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>
          <Icon name="shield" className="icon-sm" /> DPDP — consent &amp; erasure
        </h4>
        <p className="text-sm text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
          Marketing consent is captured per guest and can be withdrawn at any time. A guest&apos;s
          right to erasure is honoured from their profile — personal fields are anonymised while
          billable records are retained for the statutory window below. Open any guest under{" "}
          <Link href="/guests">Guests</Link> to withdraw consent or erase data.
        </p>
      </div>

      <div className="card card-padded">
        <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>
          <Icon name="globe" className="icon-sm" /> Foreign guests — Form C / FRRO
        </h4>
        <p className="text-sm text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
          Foreign nationals must be reported to the FRRO via Form C. StayKit flags foreign guests
          and queues a reminder; file the report on the government portal.
        </p>
        <a
          className="btn btn-sm"
          href={FRRO_FORM_C_URL}
          target="_blank"
          rel="noreferrer"
          style={{ marginTop: 12 }}
        >
          <Icon name="external" className="icon-sm" /> Open the FRRO portal
        </a>
      </div>

      <div className="card card-padded">
        <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>
          <Icon name="book" className="icon-sm" /> Statutory record retention
        </h4>
        <div className="kv-grid">
          <div className="kv">
            <div className="k">GST records</div>
            <div className="v">{RETENTION.gstYears} years</div>
          </div>
          <div className="kv">
            <div className="k">Income-tax records</div>
            <div className="v">{RETENTION.incomeTaxYears} years</div>
          </div>
          <div className="kv">
            <div className="k">Guest ID after checkout</div>
            <div className="v">{RETENTION.guestIdDaysAfterCheckout} days</div>
          </div>
        </div>
      </div>
    </>
  );
}
