import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/actions/bookings", () => ({
  checkInAction: vi.fn().mockResolvedValue({ ok: true }),
  checkOutAction: vi.fn().mockResolvedValue({ ok: true }),
  sendPaymentLinkAction: vi.fn().mockResolvedValue({ ok: true, message: "Link sent: http://x/pay/1" }),
  markPaidAction: vi.fn().mockResolvedValue({ ok: true }),
  cancelAction: vi.fn().mockResolvedValue({ ok: true }),
}));

import {
  checkInAction,
  checkOutAction,
  sendPaymentLinkAction,
  markPaidAction,
  cancelAction,
} from "@/lib/actions/bookings";
import { BookingDetailView, type BookingDetailData } from "./BookingDetailView";
import type { DisplayState } from "@/components/ui";

function makeData(state: DisplayState, over: Partial<BookingDetailData> = {}): BookingDetailData {
  return {
    id: "b1",
    ref: "SK-CO2403",
    state,
    room: { number: "103", name: "Hibiscus" },
    guest: {
      id: "g1", name: "Sameer Khan", city: "Bengaluru", phone: "+91...", email: "s@k.in",
      isForeign: false, idType: "AADHAAR", idLast4: "8821", stays: 3,
    },
    checkIn: "12 Jun", checkOut: "15 Jun", checkInTime: "14:00", checkOutTime: "11:00",
    nights: 3, adults: 2, children: 0,
    channel: { key: "direct", name: "Direct" },
    money: { subtotal: "₹ 18,000", tax: "₹ 900", total: "₹ 18,900", paid: "₹ 9,450", due: "₹ 9,450", dueRaw: 945000, taxLabel: "5% GST", nightly: "₹ 6,000" },
    payments: [
      { icon: "send", tone: "", title: "Link created", sub: "yesterday" },
      { icon: "check", tone: "ok", title: "received", sub: "today" },
      { icon: "clock", tone: "empty", title: "balance", sub: "due" },
    ],
    comms: [
      { icon: "mail", tone: "accent", title: "confirmation", sub: "today" },
      { icon: "phone", tone: "", title: "payment link", sub: "today" },
    ],
    audit: [
      { bot: true, actor: "Claude (AI)", what: "sent link", when: "today" },
      { bot: false, actor: "Priya", what: "created booking", when: "yesterday" },
    ],
    notes: "Late arrival",
    ...over,
  };
}

type M = ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply implementations (the global afterEach restores mocks between tests).
  (checkInAction as unknown as M).mockResolvedValue({ ok: true });
  (checkOutAction as unknown as M).mockResolvedValue({ ok: true });
  (sendPaymentLinkAction as unknown as M).mockResolvedValue({ ok: true, message: "Link sent: http://x/pay/1" });
  (markPaidAction as unknown as M).mockResolvedValue({ ok: true });
  (cancelAction as unknown as M).mockResolvedValue({ ok: true });
});

describe("BookingDetailView", () => {
  it("renders the hero and switches between tabs", () => {
    render(<BookingDetailView data={makeData("partial")} />);
    expect(screen.getByText("Sameer Khan")).toBeTruthy();
    expect(screen.getByText(/103 · Hibiscus/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Guest" }));
    expect(screen.getByText("Primary guest")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Payments" }));
    expect(screen.getByText("Payment status")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Messages" }));
    expect(screen.getByText("Messages sent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(screen.getByText("Activity log")).toBeTruthy();
  });

  it("sends a payment link and surfaces the toast (unpaid/partial)", async () => {
    render(<BookingDetailView data={makeData("partial")} />);
    fireEvent.click(screen.getByRole("button", { name: /Send payment link/ }));
    await waitFor(() => expect(sendPaymentLinkAction).toHaveBeenCalledWith("b1"));
    expect(await screen.findByText(/Link sent/)).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it("checks in from the paid state", async () => {
    render(<BookingDetailView data={makeData("paid")} />);
    fireEvent.click(screen.getByRole("button", { name: /Check in/ }));
    await waitFor(() => expect(checkInAction).toHaveBeenCalledWith("b1"));
  });

  it("checks out from the checked-in state", async () => {
    render(<BookingDetailView data={makeData("checkedin")} />);
    fireEvent.click(screen.getByRole("button", { name: /Check out/ }));
    await waitFor(() => expect(checkOutAction).toHaveBeenCalledWith("b1"));
  });

  it("confirms & marks paid from the tentative state", async () => {
    render(<BookingDetailView data={makeData("tentative")} />);
    fireEvent.click(screen.getByRole("button", { name: /Confirm & mark paid/ }));
    await waitFor(() => expect(markPaidAction).toHaveBeenCalledWith("b1"));
  });

  it("cancels after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BookingDetailView data={makeData("partial")} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(cancelAction).toHaveBeenCalledWith("b1", "Owner cancellation"));
  });

  it("does not cancel when the confirm dialog is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<BookingDetailView data={makeData("partial")} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelAction).not.toHaveBeenCalled();
  });

  it("hides primary + cancel actions for a checked-out booking", () => {
    render(<BookingDetailView data={makeData("checkedout")} />);
    expect(screen.queryByRole("button", { name: /Check in|Check out|payment link/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("navigates back to the bookings list", () => {
    render(<BookingDetailView data={makeData("paid")} />);
    fireEvent.click(screen.getByLabelText("Back"));
    expect(push).toHaveBeenCalledWith("/bookings");
  });

  it("renders the owner-block case without a guest tab body", () => {
    render(<BookingDetailView data={makeData("paid", { guest: null, notes: null })} />);
    expect(screen.getByText("Owner block")).toBeTruthy();
  });
});
