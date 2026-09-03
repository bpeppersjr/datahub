import { createConnectorRegistry } from "../runner/connector-registry.mjs";

try {
  const registry = await createConnectorRegistry();
  const connectors = registry.list();
  const implemented = connectors.filter((connector) => connector.implementation_status !== "unspecified").length;
  const networked = connectors.filter((connector) => connector.allowed_hosts.length > 0).length;
  const secretBacked = connectors.filter((connector) => connector.named_secret_references.length > 0).length;
  console.log(`Connector registry ${registry.version}: PASS`);
  console.log(`Connectors: ${registry.connectorCount}; source-policy profiles: ${registry.policyProfileCount}`);
  console.log(`Declared implementation status: ${implemented}; networked: ${networked}; named-secret references: ${secretBacked}`);
  console.log(connectors.map((connector) => connector.connector_id).join("\n"));
} catch (error) {
  console.error(error.message);
  for (const failure of error.failures ?? []) console.error(`${failure.path}: ${failure.message} [${failure.code}]`);
  process.exitCode = 1;
}
