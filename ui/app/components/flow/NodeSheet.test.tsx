import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { renderWithRoot } from "../../../test/render";
import { NodeSheet, type NodeSheetProps } from "./NodeSheet";
import { emptyTopology, type Topology } from "../../shared/flow/topology";
import type { FlowGraph, FlowNode } from "../../shared/flow/types";

jest.mock("@dynatrace/strato-components/charts", () => jest.requireActual<typeof import("../../../test/mocks")>("../../../test/mocks").chartsMock());

const node = (over: Partial<FlowNode> & Pick<FlowNode, "id" | "kind" | "label">): FlowNode => ({
  configuration: "logs",
  records: 3600,
  rate: 1,
  bytesRate: null,
  series: [60, 60],
  ...over,
});

const NODES: FlowNode[] = [
  node({ id: "src:logs:oneagent", kind: "source", label: "OneAgent", raw: "oneagent" }),
  node({ id: "src:logs:other", kind: "source", label: "Other", isOther: true, collapsed: ["src:logs:/api/a", "src:logs:/api/b"] }),
  node({ id: "pipe:logs:p1", kind: "pipeline", label: "My pipeline", pipelineKey: "pipe:logs:p1", raw: "p1" }),
  node({ id: "pipe:logs:default", kind: "pipeline", label: "Default", builtin: true }),
  node({ id: "pipe:logs:id:ghost", kind: "pipeline", label: "ghost" }),
  node({ id: "dest:default_logs", kind: "destination", label: "default_logs", bucket: "default_logs", bytesRate: 2048 }),
  node({ id: "dest:none", kind: "destination", label: "Not stored" }),
  node({ id: "fwd:logs:s3", kind: "destination", label: "S3 export", configuredOnly: true }),
];

const graph: FlowGraph = { nodes: NODES, edges: [], windowSeconds: 3600, start: new Date("2026-11-13T00:00:00Z"), intervalMs: 60_000 };

const topology = (): Topology => {
  const t = emptyTopology();
  t.pipelines.set("pipe:logs:p1", {
    key: "pipe:logs:p1",
    configuration: "logs",
    objectId: "obj1",
    name: "My pipeline",
    customId: "p1",
    buckets: ["default_logs", "audit_logs"],
    value: {
      processing: { processors: [{ id: "drop-debug", type: "drop", description: "Drop debug", enabled: false, matcher: 'loglevel == "DEBUG"' }] },
      storage: { processors: [{ id: "store", type: "bucketAssignment", description: "Store", matcher: "true" }] },
    },
  });
  t.routes.set("r1", { configuration: "logs", description: "Route to my pipeline", pipelineKey: "pipe:logs:p1", matcher: "true", enabled: true });
  t.ingestSources.push({ configuration: "logs", name: "OneAgent logs", source: "oneagent", pipelineKey: "pipe:logs:p1" });
  t.forwarding.push({ key: "fwd:logs:s3", configuration: "logs", name: "S3 export", summary: { target: { bucket: "archive" }, enabled: true, note: null } });
  return t;
};

const BILLING = [{ "event.type": "Log Management & Analytics - Ingest & Process", "usage.bucket": "default_logs", bytes: 1073741824, dp: 0, spans: 0 }];

const render = (nodeId: string, over: Partial<NodeSheetProps> = {}) => {
  const onClose = jest.fn();
  renderWithRoot(
    <MemoryRouter initialEntries={["/flow"]}>
      <Routes>
        <Route
          path="/flow"
          element={
            <NodeSheet
              graph={graph}
              nodeId={nodeId}
              topology={topology()}
              window="1h"
              mode="bytes"
              color="#000"
              billing24h={BILLING}
              retention={new Map([["default_logs", 35]])}
              onClose={onClose}
              {...over}
            />
          }
        />
        <Route path="/" element={<div>Overview page</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return onClose;
};

describe("NodeSheet", () => {
  it("renders nothing for an unknown node", () => {
    render("missing");
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("shows a source with its throughput and static ingest source routing", () => {
    render("src:logs:oneagent");
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("oneagent")).toBeInTheDocument();
    expect(screen.getByText(/Throughput, last hour/)).toBeInTheDocument();
    expect(screen.getByText(/Ingest source "OneAgent logs" \(oneagent\) routes statically to My pipeline/)).toBeInTheDocument();
  });

  it("lists the sources combined into Other", () => {
    render("src:logs:other");
    expect(screen.getByText("Combined sources: /api/a, /api/b")).toBeInTheDocument();
  });

  it("shows a pipeline's processors, bucket assignments and routes", () => {
    render("pipe:logs:p1");
    expect(screen.getByText("Processors (2)")).toBeInTheDocument();
    // DataTable rows are virtualised and not laid out in jsdom; the column headers are.
    expect(screen.getAllByText("Stage").length).toBeGreaterThan(0);
    expect(screen.getByText("Bucket assignments: default_logs, audit_logs")).toBeInTheDocument();
    expect(screen.getByText("Routes into this pipeline")).toBeInTheDocument();
    expect(screen.getAllByText("Route").length).toBeGreaterThan(0);
  });

  it("explains a built-in pipeline", () => {
    render("pipe:logs:default");
    expect(screen.getByText("Built-in pipeline: no custom processors.")).toBeInTheDocument();
  });

  it("explains a pipeline missing from settings", () => {
    render("pipe:logs:id:ghost");
    expect(screen.getByText("Pipeline not found in settings; showing the raw id.")).toBeInTheDocument();
  });

  it("shows a bucket's billed bytes and retention and links to the Overview", () => {
    render("dest:default_logs");
    expect(screen.getByText(/Billed bytes \(last 24 h\):\s*1(\.0+)? GiB/)).toBeInTheDocument();
    expect(screen.getByText("Retention: 35 days")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open in Overview" }));
    expect(screen.getByText("Overview page")).toBeInTheDocument();
  });

  it("says when a bucket has no byte billing or known retention", () => {
    render("dest:default_logs", { billing24h: [], retention: new Map() });
    expect(screen.getByText(/not billed by bytes/)).toBeInTheDocument();
    expect(screen.getByText("Retention: unknown")).toBeInTheDocument();
  });

  it("explains records that are not stored in a bucket", () => {
    render("dest:none");
    expect(screen.getByText("These records are processed but not stored in a bucket.")).toBeInTheDocument();
  });

  it("shows a configured-only forwarding target with its settings summary and no chart", () => {
    render("fwd:logs:s3");
    expect(screen.getByText("Configured, no throughput data in the self-monitoring metrics.")).toBeInTheDocument();
    expect(screen.getByText("target.bucket: archive")).toBeInTheDocument();
    expect(screen.getByText("enabled: true")).toBeInTheDocument();
    expect(screen.getByText("note: –")).toBeInTheDocument();
    expect(screen.queryByText(/Throughput/)).toBeNull();
  });

  it("calls onClose from the Close button", () => {
    const onClose = render("src:logs:oneagent");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
