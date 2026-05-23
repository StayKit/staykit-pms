import { describe, it, expect, vi, type Mock } from "vitest";

vi.mock("@/lib/auth/session", () => ({ destroySession: vi.fn() }));

import { POST } from "./route";
import { destroySession } from "@/lib/auth/session";

describe("POST /api/auth/guest/logout", () => {
  it("destroys the guest session and redirects to /my", async () => {
    const res = await POST(new Request("http://localhost:3000/api/auth/guest/logout", { method: "POST" }));
    expect(destroySession as Mock).toHaveBeenCalledWith("guest");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/my");
  });
});
