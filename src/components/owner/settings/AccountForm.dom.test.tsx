import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/lib/actions/settings", () => ({ updateAccountAction: vi.fn() }));

import { updateAccountAction } from "@/lib/actions/settings";
import { AccountForm } from "./AccountForm";

const mockUpdate = updateAccountAction as unknown as Mock;
const initial = { name: "Priya", email: "p@stay.in", phone: "+919800014782" };

beforeEach(() => {
  state.refresh.mockClear();
  mockUpdate.mockReset();
});

describe("AccountForm", () => {
  it("submits edited values and shows the returned message", async () => {
    mockUpdate.mockResolvedValue({ ok: true, message: "Saved." });
    render(<AccountForm initial={initial} />);
    fireEvent.change(screen.getByDisplayValue("Priya"), { target: { value: "Priya R" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ name: "Priya R" });
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(state.refresh).toHaveBeenCalled();
  });

  it("disables the form when not the owner", () => {
    render(<AccountForm initial={initial} disabled />);
    expect(
      (screen.getByRole("button", { name: /Save changes/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByDisplayValue("Priya") as HTMLInputElement).disabled).toBe(true);
  });
});
