import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), search: "new=1" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, refresh: state.refresh }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/lib/actions/bookings", () => ({
  createBookingAction: vi.fn(),
  // Default: no quote override, so the optimistic base rate stands. Tests can override.
  quoteBookingAction: vi.fn().mockResolvedValue({ ok: false, unavailableRoomIds: [] }),
}));

import { createBookingAction } from "@/lib/actions/bookings";
import { QuickAdd } from "./QuickAdd";

const mockCreate = createBookingAction as unknown as ReturnType<typeof vi.fn>;
const props = {
  propertyId: "p1",
  rooms: [
    { id: "r1", label: "101 — Hibiscus (Deluxe)", baseRateRupees: 6300 },
    { id: "r2", label: "102 — Cardamom (Deluxe)", baseRateRupees: 4200 },
  ],
  channels: [
    { key: "direct", name: "Direct" },
    { key: "airbnb", name: "Airbnb" },
  ],
};

beforeEach(() => {
  state.push.mockClear();
  state.refresh.mockClear();
  state.search = "new=1";
  mockCreate.mockReset();
});

function fillGuest() {
  fireEvent.change(screen.getByPlaceholderText("+91 98xxx xxxxx"), {
    target: { value: "+919812300000" },
  });
  fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Sameer" } });
}

describe("QuickAdd", () => {
  it("requires guest name and mobile before review", () => {
    render(<QuickAdd {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(screen.getByText(/Guest name and mobile are required/)).toBeTruthy();
  });

  it("creates a booking end-to-end and closes on success", async () => {
    mockCreate.mockResolvedValue({ ok: true, ref: "SK-AAAAA", bookingId: "b1" });
    render(<QuickAdd {...props} />);
    fillGuest();
    fireEvent.click(screen.getByText("Airbnb")); // pick a channel
    fireEvent.click(screen.getByRole("button", { name: /Review/ }));

    expect(await screen.findByText("Confirm details")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Create booking/ }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    const arg = mockCreate.mock.calls[0][0];
    expect(arg).toMatchObject({
      propertyId: "p1",
      guestName: "Sameer",
      guestPhone: "+919812300000",
      channelKey: "airbnb",
    });
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("?"));
    expect(state.refresh).toHaveBeenCalled();
  });

  it("shows the server error on the review step on failure", async () => {
    mockCreate.mockResolvedValue({ ok: false, message: "That room is already booked" });
    render(<QuickAdd {...props} />);
    fillGuest();
    fireEvent.click(screen.getByRole("button", { name: /Review/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Create booking/ }));
    expect(await screen.findByText(/already booked/)).toBeTruthy();
    // stays on the review step so the user can retry
    expect(screen.getByText("Confirm details")).toBeTruthy();
  });

  it("prefills the room and date from the URL", () => {
    state.search = "new=1&room=r2&date=2026-07-01";
    render(<QuickAdd {...props} />);
    expect((screen.getByDisplayValue("102 — Cardamom (Deluxe)") as HTMLSelectElement).value).toBe(
      "r2",
    );
  });

  it("closes via the Cancel button", () => {
    render(<QuickAdd {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(state.push).toHaveBeenCalledWith("?");
  });

  it("updates the nightly rate when the room changes", () => {
    render(<QuickAdd {...props} />);
    const select = screen.getByDisplayValue("101 — Hibiscus (Deluxe)") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "r2" } });
    expect(screen.getByDisplayValue("4200") as HTMLInputElement).toBeTruthy();
  });
});
