import { describe, it, expect } from "vitest";
import { computeAvailability, freeRooms, expandBlockNights } from "./availability";
import { parseYmd } from "../dates";

const rooms = [
  { id: "r1", roomTypeId: "t1" },
  { id: "r2", roomTypeId: "t1" },
];

describe("computeAvailability", () => {
  it("marks a room unavailable when a requested night is occupied", () => {
    const occupied = [{ roomId: "r1", date: parseYmd("2026-06-12") }];
    const res = computeAvailability(rooms, occupied, [], parseYmd("2026-06-12"), parseYmd("2026-06-14"));
    expect(res.find((r) => r.roomId === "r1")?.available).toBe(false);
    expect(res.find((r) => r.roomId === "r2")?.available).toBe(true);
  });

  it("treats checkout day as free (nights are exclusive of checkout)", () => {
    // r1 occupied on the 12th only; a stay starting the 13th must be free.
    const occupied = [{ roomId: "r1", date: parseYmd("2026-06-12") }];
    const res = computeAvailability(rooms, occupied, [], parseYmd("2026-06-13"), parseYmd("2026-06-14"));
    expect(res.find((r) => r.roomId === "r1")?.available).toBe(true);
  });

  it("blocks nights inside a maintenance range", () => {
    const blocks = [{ roomId: "r2", startDate: parseYmd("2026-06-12"), endDate: parseYmd("2026-06-15") }];
    const res = computeAvailability(rooms, [], blocks, parseYmd("2026-06-14"), parseYmd("2026-06-16"));
    expect(res.find((r) => r.roomId === "r2")?.available).toBe(false);
  });
});

describe("expandBlockNights", () => {
  it("expands a block into individual night keys within the window", () => {
    const nights = expandBlockNights(
      [{ roomId: "r1", startDate: parseYmd("2026-06-12"), endDate: parseYmd("2026-06-15") }],
      parseYmd("2026-06-10"),
      parseYmd("2026-06-20"),
    );
    expect(nights).toEqual(["2026-06-12", "2026-06-13", "2026-06-14"]);
  });
});

describe("freeRooms", () => {
  it("returns only rooms free for the whole window", () => {
    const occupied = [{ roomId: "r1", date: parseYmd("2026-06-12") }];
    const free = freeRooms(rooms, occupied, [], parseYmd("2026-06-12"), parseYmd("2026-06-13"));
    expect(free).toEqual(["r2"]);
  });
});
