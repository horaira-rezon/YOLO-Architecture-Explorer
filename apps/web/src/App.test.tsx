import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotFoundPage } from "./pages/NotFoundPage";

describe("NotFoundPage", () => {
  it("offers a way back", () => {
    render(<MemoryRouter><NotFoundPage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /start/i })).toHaveAttribute("href", "/");
  });
});
