import React from "react";
import { CodeSnippet, MessageContainer } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { getAppName, getCurrentUserDetails, getEnvironmentId } from "@dynatrace-sdk/app-environment";

function details(scopes: readonly string[], action: string): string {
  let env = "";
  let app = "Ingest Volume Estimator";
  let email = "";
  let id = "";
  try {
    env = getEnvironmentId();
    app = getAppName();
    const user = getCurrentUserDetails();
    email = user.email;
    id = user.id;
  } catch {
    // Not running inside AppEngine (e.g. tests); leave details blank.
  }
  return [
    `Message: You'll need some additional permissions to ${action}`,
    `Missing permissions: ${scopes.join(", ")};`,
    `Environment: ${env}`,
    `App name: ${app}`,
    `User email: ${email}`,
    `User ID: ${id}`,
  ].join("\n");
}

/** Shown in place of a tile or page whose query was denied. Names the scope(s) it needs. */
export const MissingScope = ({
  scopes,
  action = "view this data",
}: {
  scopes: readonly string[];
  action?: string;
}) => (
  <MessageContainer variant="warning">
    <MessageContainer.Title>You'll need some additional permissions to {action}</MessageContainer.Title>
    <MessageContainer.Description>
      <Flex flexDirection="column" gap={8}>
      <Paragraph>
        Required: {scopes.join(", ")}. Copy the details below and share them with your admin.
      </Paragraph>
      <CodeSnippet showLineNumbers={false} size="condensed">
        {details(scopes, action)}
        </CodeSnippet>
      </Flex>
    </MessageContainer.Description>
  </MessageContainer>
);
