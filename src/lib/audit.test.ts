import { describe, it, expect, beforeEach } from "vitest";
import { writeAudit, recentActivity } from "./audit";
import { resetDb, seedBasic, type Fixture } from "../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic();
});

describe("writeAudit", () => {
  it("records an immutable audit row with actor attribution", async () => {
    const row = await writeAudit({
      ownerId: fx.owner.id,
      actorType: "USER",
      actorName: "Priya",
      action: "BOOKING_CREATED",
      entityType: "Booking",
      entityId: "b1",
      summary: "created booking",
    });
    expect(row.action).toBe("BOOKING_CREATED");
    expect(row.actorType).toBe("USER");
    expect(row.diff).toBeNull();
  });

  it("serialises a diff to JSON when provided", async () => {
    const row = await writeAudit({
      ownerId: fx.owner.id,
      actorType: "MCP",
      action: "BOOKING_MODIFIED",
      diff: { from: 1, to: 2 },
    });
    expect(JSON.parse(row.diff!)).toEqual({ from: 1, to: 2 });
    expect(row.actorType).toBe("MCP");
  });
});

describe("recentActivity", () => {
  it("returns the most recent rows first, limited", async () => {
    for (let i = 0; i < 5; i++) {
      await writeAudit({
        ownerId: fx.owner.id,
        actorType: "SYSTEM",
        action: `A${i}`,
        summary: `s${i}`,
      });
    }
    const rows = await recentActivity(fx.owner.id, 3);
    expect(rows).toHaveLength(3);
    // newest first
    expect(rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(rows[1].createdAt.getTime());
  });
});
