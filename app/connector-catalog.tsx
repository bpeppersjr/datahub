'use client';

import { useEffect, useMemo, useState } from 'react';
import { runnerJson } from './runner-client';

type Connector = {
  connector_id: string;
  version: string;
  description: string;
  implementation_status: string;
  lifecycle: string[];
  configuration_defaults: Record<string, unknown>;
  required_configuration: string[];
  named_secret_references: Array<{ name: string; purpose?: string | null; storage?: string | null }>;
  input_artifact_types: string[];
  output_artifact_types: string[];
  allowed_hosts: string[];
  redirect_policy: string;
  resource_class: string;
  source_policy: {
    path: string;
    policy_id: string;
    version: string;
    redistribution: string;
    export_policy: string | null;
  };
  produced_entities: string[];
  produced_identifiers: string[];
  manifest_sha256: string;
};

type Catalog = {
  registry_version: string;
  connector_count: number;
  policy_profile_count: number;
  connectors: Connector[];
};

type Scope = 'all' | 'network' | 'local' | 'secret';

function humanize(value: string) {
  return value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ConnectorCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void runnerJson<Catalog>('/api/connectors', { signal: controller.signal })
      .then(setCatalog)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Unable to load the connector registry.');
      });
    return () => controller.abort();
  }, []);

  const connectors = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (catalog?.connectors ?? []).filter((connector) => {
      if (scope === 'network' && connector.allowed_hosts.length === 0) return false;
      if (scope === 'local' && connector.allowed_hosts.length > 0) return false;
      if (scope === 'secret' && connector.named_secret_references.length === 0) return false;
      if (!needle) return true;
      return [
        connector.connector_id,
        connector.description,
        connector.implementation_status,
        connector.resource_class,
        connector.source_policy.policy_id,
        ...connector.allowed_hosts,
        ...connector.produced_entities,
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [catalog, query, scope]);

  const networked = catalog?.connectors.filter((connector) => connector.allowed_hosts.length > 0).length ?? 0;
  const secrets = catalog?.connectors.filter((connector) => connector.named_secret_references.length > 0).length ?? 0;

  return (
    <section id="connectors" className="panel connector-panel">
      <div className="panel-heading connector-heading">
        <div>
          <span className="section-kicker">Governed acquisition contracts</span>
          <h2>Connector registry <em>v{catalog?.registry_version ?? '—'}</em></h2>
        </div>
        <span className={`registry-gate ${catalog && !error ? 'ready' : ''}`}><i /> {catalog && !error ? 'Startup validated' : 'Loading registry'}</span>
      </div>

      <div className="connector-metrics">
        <div><span>Connectors</span><strong>{catalog?.connector_count ?? '—'}</strong><small>Versioned acquisition and processing contracts</small></div>
        <div><span>Policy profiles</span><strong>{catalog?.policy_profile_count ?? '—'}</strong><small>Exact local source-policy documents</small></div>
        <div><span>Networked</span><strong>{networked || '—'}</strong><small>Restricted to declared hostnames</small></div>
        <div><span>Named secrets</span><strong>{secrets}</strong><small>References shown; values never exposed</small></div>
      </div>

      <div className="connector-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search connectors, entities, policies, or hosts" aria-label="Search connector registry" />
        <select value={scope} onChange={(event) => setScope(event.target.value as Scope)} aria-label="Filter connector scope">
          <option value="all">All execution scopes</option>
          <option value="network">Network acquisition</option>
          <option value="local">Local processing</option>
          <option value="secret">Named secret required</option>
        </select>
        <span>{connectors.length} shown</span>
      </div>

      {error && <div className="connector-error">{error}</div>}
      {!error && !catalog && <div className="connector-empty">Validating connector manifests and policies…</div>}
      {catalog && (
        <div className="connector-list">
          {connectors.map((connector) => (
            <details className="connector-row" key={connector.connector_id}>
              <summary>
                <div className="connector-identity"><i className={connector.allowed_hosts.length ? 'network' : 'local'}>{connector.allowed_hosts.length ? 'NET' : 'LOC'}</i><div><strong>{connector.connector_id}</strong><small>{connector.description}</small></div></div>
                <span>v{connector.version}</span>
                <span>{humanize(connector.resource_class)}</span>
                <span className="connector-policy">{connector.source_policy.export_policy ? humanize(connector.source_policy.export_policy) : 'Policy controlled'}</span>
                <b aria-hidden="true">⌄</b>
              </summary>
              <div className="connector-detail">
                <div><span>Implementation status</span><p>{humanize(connector.implementation_status)}</p></div>
                <div><span>Lifecycle</span><p>{connector.lifecycle.join(' → ')}</p></div>
                <div><span>Source policy</span><p>{connector.source_policy.path} · v{connector.source_policy.version}</p><small>{connector.source_policy.redistribution}</small></div>
                <div><span>Network boundary</span><p>{connector.allowed_hosts.length ? connector.allowed_hosts.join(', ') : 'No network access'} · {connector.redirect_policy}</p></div>
                <div><span>Configuration</span><p>{Object.keys(connector.configuration_defaults).length} defaults · {connector.required_configuration.length} required</p>{connector.required_configuration.length > 0 && <small>Required: {connector.required_configuration.join(', ')}</small>}</div>
                <div><span>Artifacts</span><p>{connector.input_artifact_types.length} inputs → {connector.output_artifact_types.length} outputs</p></div>
                <div><span>Produced records</span><p>{connector.produced_entities.join(', ')}</p><small>{connector.produced_identifiers.length} governed identifier types</small></div>
                <div><span>Secret references</span><p>{connector.named_secret_references.length ? connector.named_secret_references.map((secret) => secret.name).join(', ') : 'None'}</p><small>Reference names only; values are never part of the catalog.</small></div>
                <div><span>Manifest proof</span><p className="connector-hash">sha256:{connector.manifest_sha256}</p></div>
              </div>
            </details>
          ))}
          {!connectors.length && <div className="connector-empty">No connector matches this filter.</div>}
        </div>
      )}
    </section>
  );
}
