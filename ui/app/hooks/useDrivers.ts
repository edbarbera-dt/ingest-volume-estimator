import { useMemo } from "react";
import { HOST_DRIVERS } from "../queries/billing";
import { ENTITY_DRIVERS } from "../queries/drivers";
import { parseEntityDrivers, parseHostDrivers, type HostDrivers } from "../queries/parse";
import type { Driver } from "../shared/signals";
import { useTimeframe } from "../context/Timeframe";
import { useTimeframedDql, type QueryResult } from "./useTimeframedDql";

export interface DriverCounts {
  /** Entity counts from Smartscape; hosts is the larger of Smartscape and billed hosts. */
  counts: Record<Driver, number>;
  billing: HostDrivers;
}

/** Q3 + Q4: current driver counts. */
export function useDrivers(): QueryResult<DriverCounts> {
  const tf = useTimeframe();
  const hosts = useTimeframedDql(HOST_DRIVERS, tf, parseHostDrivers);
  const entities = useTimeframedDql(ENTITY_DRIVERS, tf, parseEntityDrivers);

  const data = useMemo(() => {
    if (!hosts.data || !entities.data) return undefined;
    return {
      counts: { ...entities.data, hosts: Math.max(entities.data.hosts, hosts.data.hosts) },
      billing: hosts.data,
    };
  }, [hosts.data, entities.data]);

  return {
    data,
    isLoading: hosts.isLoading || entities.isLoading,
    error: hosts.error ?? entities.error,
    refetch: () => {
      hosts.refetch();
      entities.refetch();
    },
  };
}
