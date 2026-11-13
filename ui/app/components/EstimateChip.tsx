import React from "react";
import { Chip } from "@dynatrace/strato-components/content";
import { useRateCard } from "../hooks/useRateCard";

/** Marks cost figures as list-price estimates until the rate card has been edited. */
export const EstimateChip = () => {
  const { isListPrice } = useRateCard();
  return isListPrice ? (
    <Chip color="warning" size="condensed">
      estimate, list price
    </Chip>
  ) : (
    <Chip color="neutral" size="condensed">
      estimate, custom rate card
    </Chip>
  );
};
