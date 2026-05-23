import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

vi.mock("@/lib/actions/auth", () => ({
  requestStaffOtp: vi.fn(),
  verifyStaffOtp: vi.fn(),
  requestGuestOtp: vi.fn(),
  verifyGuestOtp: vi.fn(),
}));

import {
  requestStaffOtp,
  verifyStaffOtp,
  requestGuestOtp,
  verifyGuestOtp,
} from "@/lib/actions/auth";
import { OtpFlow } from "./OtpFlow";

beforeEach(() => vi.clearAllMocks());

describe("OtpFlow (staff)", () => {
  it("sends a code, shows the dev code, then verifies and navigates", async () => {
    (requestStaffOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, requestId: "r1", devCode: "123456" });
    (verifyStaffOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    render(<OtpFlow mode="staff" successHref="/dashboard" />);

    fireEvent.change(screen.getByPlaceholderText(/98xxx/), { target: { value: "+919812300000" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText(/Enter the 6-digit code/);
    expect(requestStaffOtp).toHaveBeenCalledWith("+919812300000");
    expect(screen.getByText(/123456/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("••••••"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows an error when the code request fails", async () => {
    (requestStaffOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, message: "No active staff account" });
    render(<OtpFlow mode="staff" successHref="/dashboard" />);
    fireEvent.change(screen.getByPlaceholderText(/98xxx/), { target: { value: "+910000000000" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/No active staff account/)).toBeTruthy();
  });

  it("shows an error when verification fails, and resends on demand", async () => {
    (requestStaffOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, requestId: "r1" });
    (verifyStaffOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, message: "That code didn't match" });
    render(<OtpFlow mode="staff" successHref="/dashboard" />);

    fireEvent.change(screen.getByPlaceholderText(/98xxx/), { target: { value: "+919812300000" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByText(/Enter the 6-digit code/);

    fireEvent.change(screen.getByPlaceholderText("••••••"), { target: { value: "999999" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    expect(await screen.findByText(/didn't match/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /resend/i }));
    await waitFor(() => expect(requestStaffOtp).toHaveBeenCalledTimes(2));
  });

  it("strips non-digits from the OTP input", async () => {
    (requestStaffOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, requestId: "r1" });
    (verifyStaffOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<OtpFlow mode="staff" successHref="/dashboard" />);
    fireEvent.change(screen.getByPlaceholderText(/98xxx/), { target: { value: "+919812300000" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByText(/Enter the 6-digit code/);
    const otp = screen.getByPlaceholderText("••••••") as HTMLInputElement;
    fireEvent.change(otp, { target: { value: "12-34ab56" } });
    expect(otp.value).toBe("123456");
  });
});

describe("OtpFlow (guest)", () => {
  it("uses the guest actions and navigates on success", async () => {
    (requestGuestOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, requestId: "g1", devCode: "654321" });
    (verifyGuestOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<OtpFlow mode="guest" successHref="/my/bookings" compact />);

    fireEvent.change(screen.getByPlaceholderText(/98xxx/), { target: { value: "+919812300000" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByText(/Enter the 6-digit code/);
    expect(requestGuestOtp).toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("••••••"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/my/bookings"));
  });
});
