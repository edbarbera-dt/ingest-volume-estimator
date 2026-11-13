import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithRoot } from "../../../test/render";
import { FlowCanvas } from "./FlowCanvas";
import { buildFlowGraph } from "../../shared/flow/graph";
import { emptyTopology } from "../../shared/flow/topology";
import { avgRecordSizes } from "../../shared/flow/bytesEstimate";
import routing1h from "../../shared/flow/__fixtures__/routing-1h.json";
import out1h from "../../shared/flow/__fixtures__/out-1h.json";
import sources1h from "../../shared/flow/__fixtures__/sources-1h.json";
import billing24h from "../../shared/flow/__fixtures__/billing-24h.json";
import out24h from "../../shared/flow/__fixtures__/out-24h.json";

const graph = buildFlowGraph({
  signal: "events",
  sources: sources1h,
  routing: routing1h,
  out: out1h,
  topology: emptyTopology(),
  recordSizes: avgRecordSizes(billing24h, out24h),
  windowSeconds: 3600,
});

describe("FlowCanvas (rkj7350h events, 1h)", () => {
  it("draws one path per edge and one card per node", () => {
    renderWithRoot(<FlowCanvas graph={graph} mode="bytes" color="#000" onSelect={jest.fn()} />);
    expect(screen.getAllByTestId("flow-edge")).toHaveLength(graph.edges.length);
    expect(screen.getAllByTestId(/^flow-node-/)).toHaveLength(graph.nodes.length);
    expect(screen.getByText("/api/v2/bizevents/ingest")).toBeInTheDocument();
  });

  it("highlights a node's paths with an animated dashed line and dims the rest", () => {
    renderWithRoot(<FlowCanvas graph={graph} mode="records" color="#000" onSelect={jest.fn()} />);
    const bizSource = screen.getByText("/api/v2/bizevents/ingest").closest("foreignObject") as Element;
    fireEvent.mouseEnter(bizSource);
    const hl = screen.getAllByTestId("flow-edge-highlight");
    expect(hl).toHaveLength(2);
    expect(hl[0].getAttribute("stroke-dasharray")).toBe("8 6");
    expect(hl[0].querySelector("animate")).not.toBeNull();
    expect(screen.getAllByTestId("flow-edge").filter((e) => e.getAttribute("data-dimmed") === "true").length).toBe(graph.edges.length - 2);
    fireEvent.mouseLeave(bizSource);
    expect(screen.queryAllByTestId("flow-edge-highlight")).toHaveLength(0);
  });

  it("selects a node on click", () => {
    const onSelect = jest.fn();
    renderWithRoot(<FlowCanvas graph={graph} mode="bytes" color="#000" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /^dt_system_events/ }));
    expect(onSelect).toHaveBeenCalledWith("dest:dt_system_events");
  });

  it("shows ~bytes/s where a record size is known and rec/s elsewhere", () => {
    renderWithRoot(<FlowCanvas graph={graph} mode="bytes" color="#000" onSelect={jest.fn()} />);
    expect(screen.getAllByText(/^~[\d.]+ B\/s$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/rec\/s$/).length).toBeGreaterThan(0);
  });
});
