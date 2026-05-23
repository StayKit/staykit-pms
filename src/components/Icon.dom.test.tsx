import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Icon, ICONS } from "./Icon";

describe("Icon", () => {
  it("renders an SVG path for a known icon name", () => {
    const { container } = render(<Icon name="home" />);
    const path = container.querySelector("svg path");
    expect(path).not.toBeNull();
    expect(path?.getAttribute("d")).toBe(ICONS.home);
  });

  it("applies a custom className", () => {
    const { container } = render(<Icon name="calendar" className="icon-sm" />);
    expect(container.querySelector("svg")?.getAttribute("class")).toBe("icon-sm");
  });

  it("renders nothing for an unknown icon name", () => {
    const { container } = render(<Icon name="does-not-exist" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
