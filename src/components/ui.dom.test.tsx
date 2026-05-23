import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  deriveState,
  statusLabel,
  bbClass,
  StatusPill,
  ChannelChip,
  Avatar,
  avatarColor,
  initials,
} from "./ui";

describe("deriveState", () => {
  it("maps booking status enums to display states", () => {
    expect(deriveState({ status: "TENTATIVE", amountPaid: 0, totalAmount: 100 })).toBe("tentative");
    expect(deriveState({ status: "CHECKED_IN", amountPaid: 0, totalAmount: 100 })).toBe("checkedin");
    expect(deriveState({ status: "CHECKED_OUT", amountPaid: 0, totalAmount: 100 })).toBe("checkedout");
    expect(deriveState({ status: "CANCELLED", amountPaid: 0, totalAmount: 100 })).toBe("cancelled");
    expect(deriveState({ status: "NO_SHOW", amountPaid: 0, totalAmount: 100 })).toBe("noshow");
  });

  it("derives payment state for confirmed bookings", () => {
    expect(deriveState({ status: "CONFIRMED", amountPaid: 100, totalAmount: 100 })).toBe("paid");
    expect(deriveState({ status: "CONFIRMED", amountPaid: 50, totalAmount: 100 })).toBe("partial");
    expect(deriveState({ status: "CONFIRMED", amountPaid: 0, totalAmount: 100 })).toBe("unpaid");
  });
});

describe("statusLabel & bbClass", () => {
  it("labels known states and falls back to the raw value", () => {
    expect(statusLabel("paid")).toBe("Paid");
    expect(statusLabel("checkedin")).toBe("Checked in");
    expect(statusLabel("mystery")).toBe("mystery");
  });
  it("builds the booking-bar class", () => {
    expect(bbClass("paid")).toBe("booking-bar bb-paid");
  });
});

describe("StatusPill", () => {
  it("renders the label and maps cancelled/noshow to existing pill styles", () => {
    const a = render(<StatusPill state="paid" />);
    expect(a.getByText("Paid").className).toContain("pill-paid");

    const b = render(<StatusPill state="cancelled" />);
    expect(b.container.querySelector(".pill")?.className).toContain("pill-checkedout");

    const c = render(<StatusPill state="noshow" />);
    expect(c.container.querySelector(".pill")?.className).toContain("pill-unpaid");
  });

  it("renders custom children when provided", () => {
    const { getByText } = render(<StatusPill state="paid">Done</StatusPill>);
    expect(getByText("Done")).toBeTruthy();
  });
});

describe("ChannelChip", () => {
  it("renders the channel name with a per-channel class", () => {
    const { getByText } = render(<ChannelChip channelKey="airbnb" name="Airbnb" />);
    expect(getByText("Airbnb").className).toContain("channel-chip airbnb");
  });
});

describe("avatars", () => {
  it("derives initials from a name (max two)", () => {
    expect(initials("Sameer Khan")).toBe("SK");
    expect(initials("Prince")).toBe("P");
  });

  it("handles empty / whitespace names without throwing", () => {
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
  });

  it("assigns a deterministic colour class for an id", () => {
    expect(avatarColor("g1")).toBe(avatarColor("g1"));
  });

  it("renders an avatar with initials and an optional size", () => {
    const { getByText } = render(<Avatar name="Anika Mehta" id="g2" size={40} />);
    const el = getByText("AM");
    expect(el.className).toContain("avatar");
    expect(el.getAttribute("style")).toContain("40px");
  });
});
