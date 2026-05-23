import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/actions/bookings", () => ({
  checkInAction: vi.fn(),
  checkOutAction: vi.fn(),
  sendPaymentLinkAction: vi.fn(),
  markPaidAction: vi.fn(),
  cancelAction: vi.fn(),
}));

import { BookingDetailView, type BookingDetailData } from "./BookingDetailView";

const data: BookingDetailData = {
  id: "b1",
  ref: "SK-CO2405",
  state: "unpaid",
  room: { number: "302", name: "Western Ghats" },
  guest: {
    id: "g5",
    name: "Daniel Müller",
    city: "Berlin",
    phone: "+49",
    email: null,
    isForeign: true,
    idType: null,
    idLast4: null,
    stays: 1,
  },
  checkIn: "12 Jun",
  checkOut: "17 Jun",
  checkInTime: "14:00",
  checkOutTime: "11:00",
  nights: 5,
  adults: 2,
  children: 0,
  channel: { key: "booking", name: "Booking.com" },
  money: {
    subtotal: "₹ 39,750",
    tax: "₹ 0",
    total: "₹ 39,750",
    paid: "₹ 0",
    due: "₹ 39,750",
    dueRaw: 3975000,
    taxLabel: "No GST (owner unregistered)",
    nightly: "₹ 7,950",
  },
  payments: [],
  comms: [],
  audit: [],
  notes: null,
};

describe("BookingDetailView foreign-national badge", () => {
  it("shows the Form C reminder for a foreign guest", () => {
    render(<BookingDetailView data={data} />);
    expect(screen.getByText(/Form C pending/)).toBeTruthy();
  });

  it("renders the guest tab with no email and no ID document on file", () => {
    render(<BookingDetailView data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Guest" }));
    expect(screen.getByText("Not on file")).toBeTruthy(); // idType null
    expect(screen.getByText("—")).toBeTruthy(); // email null
  });

  it("masks the ID document when only the last-4 is missing", () => {
    const withId = { ...data, guest: { ...data.guest!, idType: "AADHAAR", idLast4: null } };
    render(<BookingDetailView data={withId} />);
    fireEvent.click(screen.getByRole("button", { name: "Guest" }));
    expect(screen.getByText(/AADHAAR — •••• ----/)).toBeTruthy();
  });

  it("shows the empty-state on the payments timeline when there are no payments", () => {
    render(<BookingDetailView data={data} />); // data.payments === []
    fireEvent.click(screen.getByRole("button", { name: "Payments" }));
    expect(screen.getByText("No payments yet.")).toBeTruthy();
  });
});
