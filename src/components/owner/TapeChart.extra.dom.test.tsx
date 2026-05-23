import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { TapeChart, type TapeGroup, type TapeBooking } from "./TapeChart";

const groups: TapeGroup[] = [
  { typeId: "t1", typeName: "Deluxe", color: "#1B5E5A", rooms: [{ id: "r1", number: "101", name: "Hibiscus", cleanliness: "CLEAN" }] },
];
// One booking far outside the visible window → its bar should be skipped.
const bookings: TapeBooking[] = [
  { id: "b1", roomId: "r1", label: "Future", checkIn: "2030-01-01", checkOut: "2030-01-03", state: "paid", meta: "2n", isBlock: false },
];

describe("TapeChart month view & out-of-window bars", () => {
  it("switches to the month view and skips bars outside the range", () => {
    render(<TapeChart anchorIso="2026-06-15" groups={groups} bookings={bookings} properties={[{ id: "p1", name: "P" }]} activePropertyId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(screen.getByRole("button", { name: "Month" }).className).toContain("active");
    // the far-future booking is not rendered as a bar
    expect(screen.queryByText("Future")).toBeNull();
  });
});
