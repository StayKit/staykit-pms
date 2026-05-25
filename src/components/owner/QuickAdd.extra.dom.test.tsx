import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const state = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), search: "new=1" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, refresh: state.refresh }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/lib/actions/bookings", () => ({
  createBookingAction: vi.fn(),
  quoteBookingAction: vi.fn().mockResolvedValue({ ok: false, unavailableRoomIds: [] }),
}));

import { QuickAdd } from "./QuickAdd";

const rooms = [{ id: "r1", label: "101 — Hibiscus (Deluxe)", baseRateRupees: 6300 }];
const channels = [{ key: "direct", name: "Direct" }];

beforeEach(() => {
  state.push.mockClear();
  state.search = "new=1";
});

function fillGuest() {
  fireEvent.change(screen.getByPlaceholderText("+91 98xxx xxxxx"), {
    target: { value: "+919812300000" },
  });
  fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Sameer" } });
}

describe("QuickAdd extra interactions", () => {
  it("renders with no rooms configured (empty fallbacks)", () => {
    render(<QuickAdd propertyId="p1" rooms={[]} channels={channels} />);
    expect(screen.getByText("Add booking")).toBeTruthy();
  });

  it("edits the adults, rate and notes fields and closes via the scrim", () => {
    const { container } = render(<QuickAdd propertyId="p1" rooms={rooms} channels={channels} />);
    const numbers = container.querySelectorAll('input[type="number"]');
    fireEvent.change(numbers[0], { target: { value: "3" } }); // adults
    fireEvent.change(numbers[2], { target: { value: "7000" } }); // rate/night
    fireEvent.change(screen.getByPlaceholderText(/special requests/), {
      target: { value: "Quiet room please" },
    });
    expect((numbers[0] as HTMLInputElement).value).toBe("3");
    fireEvent.click(container.querySelector(".scrim")!); // scrim closes the modal
    expect(state.push).toHaveBeenCalledWith("?");
  });

  it("lets the user pick a payment option and go back from review", () => {
    render(<QuickAdd propertyId="p1" rooms={rooms} channels={channels} />);
    fireEvent.click(screen.getByRole("button", { name: /Mark as paid \(cash\)/ }));
    fillGuest();
    fireEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(screen.getByText("Confirm details")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Add booking")).toBeTruthy();
  });

  it("shows singular night and a children count in the summary", () => {
    const { container } = render(<QuickAdd propertyId="p1" rooms={rooms} channels={channels} />);
    const dates = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-07-01" } }); // check-in
    fireEvent.change(dates[1], { target: { value: "2026-07-02" } }); // check-out → 1 night
    const numbers = container.querySelectorAll('input[type="number"]');
    fireEvent.change(numbers[1], { target: { value: "1" } }); // children
    fillGuest();
    fireEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(container.textContent).toContain("1 night");
    expect(container.textContent).toContain("1 children");
  });
});
