import { connectedIds } from "./highlight";
import type { FlowGraph } from "./types";

const g = {
  nodes: ["a", "b", "p", "q", "x", "y"].map((id) => ({ id })),
  edges: [
    { id: "a-p", from: "a", to: "p" },
    { id: "b-p", from: "b", to: "p" },
    { id: "p-x", from: "p", to: "x" },
    { id: "q-y", from: "q", to: "y" },
  ],
} as unknown as FlowGraph;

describe("connectedIds", () => {
  it("follows paths up- and downstream from a source", () => {
    const c = connectedIds(g, "a");
    expect([...c.edges].sort()).toEqual(["a-p", "p-x"]);
    expect([...c.nodes].sort()).toEqual(["a", "p", "x"]);
  });
  it("includes all inputs of a pipeline", () => {
    expect([...connectedIds(g, "p").edges].sort()).toEqual(["a-p", "b-p", "p-x"]);
  });
  it("walks back from a destination", () => {
    expect([...connectedIds(g, "x").nodes].sort()).toEqual(["a", "b", "p", "x"]);
  });
  it("returns empty sets for null", () => {
    expect(connectedIds(g, null).edges.size).toBe(0);
  });
});
