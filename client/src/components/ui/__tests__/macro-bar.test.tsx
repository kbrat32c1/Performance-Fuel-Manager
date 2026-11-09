import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MacroBar } from "../macro-bar";

describe("MacroBar", () => {
  it("does not show a green check when far over target", () => {
    const { container } = render(<MacroBar label="Carbs" consumed={1000} target={450} color="bg-amber-500" unit="g" />);
    expect(screen.getByText("550g over")).toBeInTheDocument();
    expect(container.querySelector(".text-green-500")).toBeNull();
    expect(container.querySelector(".bg-green-500")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("still marks a target that was hit exactly", () => {
    const { container } = render(<MacroBar label="Protein" consumed={150} target={150} color="bg-orange-500" unit="g" />);
    expect(container.querySelector(".text-green-500")).not.toBeNull();
  });

  it("shows what's left under target", () => {
    render(<MacroBar label="Carbs" consumed={100} target={450} color="bg-amber-500" unit="g" />);
    expect(screen.getByText("350g left")).toBeInTheDocument();
  });

  it("does not mark water as over", () => {
    const { container } = render(<MacroBar allowOver label="Water" consumed={120} target={100} color="bg-cyan-500" unit="oz" />);
    expect(screen.queryByText(/over/)).toBeNull();
    expect(container.querySelector(".text-green-500")).not.toBeNull();
  });

  it("does not show a check in the stacked style when over", () => {
    const { container } = render(<MacroBar variant="stacked" label="Carbs" consumed={1000} target={450} color="bg-amber-500" unit="g" />);
    expect(container.querySelector(".text-green-500")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });
});
