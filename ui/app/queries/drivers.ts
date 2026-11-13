// Tier 2: entity counts used as extrapolation drivers. Import-free (see billing.ts).

/** Q4: entity counts by Smartscape type. */
export const ENTITY_DRIVERS = `smartscapeNodes "*"
| filter in(type, {"HOST", "SERVICE", "K8S_POD", "K8S_CLUSTER", "CONTAINER"})
| summarize n = count(), by:{type}`;

export const DRIVER_QUERIES = { ENTITY_DRIVERS };
