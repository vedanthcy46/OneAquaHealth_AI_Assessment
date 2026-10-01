import React, { useState } from 'react';
import { FileCode, Copy, Download, Check } from 'lucide-react';
import { OfflineStorageService } from '../services/offlineStorage';
import { toFHIRObservation } from '../services/fhirAdapter';

export const FHIRInspector: React.FC = () => {
  const observations = OfflineStorageService.getObservations();
  const [selectedObsId, setSelectedObsId] = useState<string>(observations[0]?.id || '');
  const [copied, setCopied] = useState<boolean>(false);

  const currentObs = observations.find((o) => o.id === selectedObsId) || observations[0];
  const fhirPayload = currentObs ? toFHIRObservation(currentObs) : {};
  const jsonString = JSON.stringify(fhirPayload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FHIR-Observation-${currentObs?.id || 'sample'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container" style={{ marginTop: '28px' }}>
      {/* Title */}
      <div style={{ marginBottom: '24px' }}>
        <span className="badge badge-cyan" style={{ marginBottom: '8px' }}>
          <FileCode size={12} />
          Interoperability & Data Standards
        </span>
        <h2 style={{ fontSize: '26px' }}>HL7 FHIR R4 Interoperability Adapter</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Converts canonical stream observations into valid HL7 FHIR R4 <code>Observation</code> resources
          conforming to the <code>hl7.eu.fhir.oah</code> Implementation Guide.
        </p>
      </div>

      {/* Selector & Actions Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600 }}>Select Source Observation:</label>
          <select
            id="select-fhir-obs"
            className="input-control"
            style={{ width: '320px' }}
            value={selectedObsId}
            onChange={(e) => setSelectedObsId(e.target.value)}
          >
            {observations.map((obs) => (
              <option key={obs.id} value={obs.id}>
                {obs.siteName} — #{obs.id} ({obs.status})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button id="btn-copy-fhir" className="btn btn-secondary" style={{ fontSize: '12px' }} onClick={handleCopy}>
            {copied ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy JSON'}</span>
          </button>

          <button id="btn-download-fhir" className="btn btn-primary" style={{ fontSize: '12px' }} onClick={handleDownload}>
            <Download size={14} />
            <span>Download .json</span>
          </button>
        </div>
      </div>

      {/* JSON Viewer */}
      <div
        className="glass-panel"
        style={{
          background: '#040914',
          padding: '24px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '16px',
            right: '20px',
            display: 'flex',
            gap: '8px',
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          <span>FHIR R4 (4.0.1)</span>
          <span>•</span>
          <span style={{ color: 'var(--text-cyan)' }}>http://hl7.eu/fhir/ig/oah</span>
        </div>

        <pre
          id="code-fhir-payload"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            lineHeight: '1.6',
            color: '#38bdf8',
            maxHeight: '650px',
            overflowY: 'auto',
          }}
        >
          {jsonString}
        </pre>
      </div>
    </div>
  );
};
