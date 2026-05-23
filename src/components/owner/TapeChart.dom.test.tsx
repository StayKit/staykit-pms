import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { TapeChart, type TapeGroup, type TapeBooking } from "./TapeChart";

const groups: TapeGroup[] = [
  {
    typeId: "t1",
    typeName: "Deluxe",
    color: "#1B5E5A",
    rooms: [
      { id: "r1", number: "101", name: "Hibiscus", cleanliness: "CLEAN" },
      { id: "r2", number: "102", name: "Cardamom", cleanliness: "DIRTY" },
    ],
  },
];
const bookings: TapeBooking[] = [
  {
    id: "b1",
    roomId: "r1",
    label: "Sameer",
    checkIn: "2026-06-14",
    checkOut: "2026-06-17",
    state: "paid",
    meta: "3n",
    isBlock: false,
  },
  {
    id: "blk1",
    roomId: "r2",
    label: "Blocked",
    checkIn: "2026-06-14",
    checkOut: "2026-06-15",
    state: "block",
    meta: "Deep clean",
    isBlock: true,
  },
];
const properties = [
  { id: "p1", name: "Coorg" },
  { id: "p2", name: "Backwaters" },
];

function setup() {
  return render(
    <TapeChart
      anchorIso="2026-06-15"
      groups={groups}
      bookings={bookings}
      properties={properties}
      activePropertyId="p1"
    />,
  );
}

beforeEach(() => push.mockClear());

describe("TapeChart", () => {
  it("renders room-type groups, room rows, bars and the legend", () => {
    setup();
    expect(screen.getByText("Deluxe")).toBeTruthy();
    expect(screen.getByText("Hibiscus")).toBeTruthy();
    expect(screen.getByText("Sameer")).toBeTruthy();
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.getByText("Checked in")).toBeTruthy(); // legend label
  });

  it("opens a booking when its bar is clicked", () => {
    setup();
    fireEvent.click(screen.getByText("Sameer"));
    expect(push).toHaveBeenCalledWith("/bookings/b1");
  });

  it("does not navigate when a maintenance block bar is clicked", () => {
    setup();
    fireEvent.click(screen.getByText("Blocked"));
    expect(push).not.toHaveBeenCalled();
  });

  it("switches the active property via the chips", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Backwaters" }));
    expect(push).toHaveBeenCalledWith("/calendar?property=p2");
  });

  it("starts a quick-add when an empty cell is clicked", () => {
    const { container } = setup();
    const cell = container.querySelector(".tape-cell")!;
    fireEvent.click(cell);
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\?new=1&room=/));
  });

  it("toggles the date-range view and pages with prev/next/today", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    expect(screen.getByRole("button", { name: "Week" }).className).toContain("active");
    fireEvent.click(screen.getByTitle("Next"));
    fireEvent.click(screen.getByTitle("Previous"));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    // still rendered after paging
    expect(screen.getByText("Hibiscus")).toBeTruthy();
  });
});
