import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const state = vi.hoisted(() => ({ push: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

import { BookingsFilters } from "./BookingsFilters";

beforeEach(() => {
  state.push.mockClear();
  state.search = "";
});

describe("BookingsFilters", () => {
  it("pushes the selected filter into the URL", () => {
    render(<BookingsFilters />);
    fireEvent.click(screen.getByRole("button", { name: "Unpaid" }));
    expect(state.push).toHaveBeenCalledWith("/bookings?filter=unpaid");
  });

  it("removes the filter param when 'All' is chosen, preserving other params", () => {
    state.search = "filter=unpaid&q=sam";
    render(<BookingsFilters />);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(state.push).toHaveBeenCalledWith("/bookings?q=sam");
  });

  it("submits the search query", () => {
    render(<BookingsFilters />);
    fireEvent.change(screen.getByPlaceholderText(/Search by guest/), { target: { value: "Khan" } });
    fireEvent.submit(screen.getByPlaceholderText(/Search by guest/).closest("form")!);
    expect(state.push).toHaveBeenCalledWith("/bookings?q=Khan");
  });

  it("clears the query param when the search is emptied", () => {
    state.search = "q=old";
    render(<BookingsFilters />);
    const input = screen.getByPlaceholderText(/Search by guest/);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.submit(input.closest("form")!);
    expect(state.push).toHaveBeenCalledWith("/bookings?");
  });

  it("marks the active filter from the URL", () => {
    state.search = "filter=tentative";
    render(<BookingsFilters />);
    expect(screen.getByRole("button", { name: "Tentative" }).className).toContain("selected");
  });
});
