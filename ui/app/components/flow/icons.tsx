import React from "react";
import {
  APISignetIcon,
  AgentIcon,
  DynatraceSignetIcon,
  ExtensionsIcon,
  FilterIcon,
  OneAgentSignetIcon,
  ShareIcon,
  StorageIcon,
  UserEventsIcon,
} from "@dynatrace/strato-icons";
import type { FlowNode } from "../../shared/flow/types";

export function NodeIcon({ node }: { node: FlowNode }) {
  if (node.kind === "pipeline") return <FilterIcon />;
  if (node.kind === "destination") return node.configuredOnly ? <ShareIcon /> : <StorageIcon />;
  switch (node.sourceType) {
    case "oneagent":
      return <OneAgentSignetIcon />;
    case "api":
      return <APISignetIcon />;
    case "extension":
      return <ExtensionsIcon />;
    case "rum":
      return <UserEventsIcon />;
    case "internal":
      return <DynatraceSignetIcon />;
    default:
      return <AgentIcon />;
  }
}
