import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/lib/actions/notifications", () => ({
  toggleTemplateAction: vi.fn(),
  seedDefaultTemplatesAction: vi.fn(),
}));

import { toggleTemplateAction, seedDefaultTemplatesAction } from "@/lib/actions/notifications";
import { NotificationToggles, type ToggleRow } from "./NotificationToggles";

const mockToggle = toggleTemplateAction as unknown as Mock;
const mockSeed = seedDefaultTemplatesAction as unknown as Mock;

const rows: ToggleRow[] = [
  { id: "t1", channel: "SMS", triggerKey: "BOOKING_CONFIRMED", name: "Booking", active: true },
  { id: "t2", channel: "EMAIL", triggerKey: "BOOKING_CONFIRMED", name: "Booking", active: false },
];

beforeEach(() => {
  state.refresh.mockClear();
  mockToggle.mockReset();
  mockSeed.mockReset();
});

describe("NotificationToggles", () => {
  it("groups by trigger and toggles a template", async () => {
    mockToggle.mockResolvedValue({ ok: true });
    render(<NotificationToggles rows={rows} />);
    // One trigger label, two channel chips.
    expect(screen.getByText("Booking confirmed")).toBeTruthy();
    expect(screen.getByText("SMS")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Turn off" })); // the active SMS row
    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith("t1"));
    expect(state.refresh).toHaveBeenCalled();
  });

  it("surfaces an error message when a toggle fails", async () => {
    mockToggle.mockResolvedValue({ ok: false, message: "Template not found." });
    render(<NotificationToggles rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on" })); // the inactive email row
    expect(await screen.findByText("Template not found.")).toBeTruthy();
  });

  it("seeds defaults from the empty state", async () => {
    mockSeed.mockResolvedValue({ ok: true, message: "Added 9 templates." });
    render(<NotificationToggles rows={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Seed default templates/ }));
    await waitFor(() => expect(mockSeed).toHaveBeenCalled());
    expect(await screen.findByText("Added 9 templates.")).toBeTruthy();
  });
});
