import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FingerprintResult {
  ja3_hash: string;
  ja3_match: boolean;
  http_version: string;
  akamai_fingerprint: string;
  akamai_match: boolean;
  full_response: Record<string, unknown>;
}

export function FingerprintCheckButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FingerprintResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkFingerprint = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await invoke<FingerprintResult>('check_fingerprint');
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fingerprint-check">
      <button
        onClick={checkFingerprint}
        disabled={loading}
        className="btn btn-sm btn-secondary"
      >
        {loading ? 'Checking...' : 'Check Fingerprint'}
      </button>

      {result && (
        <div className="mt-3 p-3 bg-light rounded">
          <h6>Fingerprint Check Results</h6>
          <div className="mb-2">
            <small>
              <strong>JA3 Hash:</strong> {result.ja3_hash}
              {result.ja3_match ? (
                <span className="badge badge-success ms-2">✓ Match</span>
              ) : (
                <span className="badge badge-danger ms-2">✗ Mismatch</span>
              )}
            </small>
          </div>
          <div className="mb-2">
            <small>
              <strong>HTTP Version:</strong> {result.http_version}
            </small>
          </div>
          <div className="mb-2">
            <small>
              <strong>Akamai Fingerprint:</strong> {result.akamai_fingerprint}
              {result.akamai_match ? (
                <span className="badge badge-success ms-2">✓ Match</span>
              ) : (
                <span className="badge badge-danger ms-2">✗ Mismatch</span>
              )}
            </small>
          </div>
          {result.ja3_match && result.akamai_match && (
            <div className="alert alert-success mt-2 mb-0" role="alert">
              ✓ Fingerprint is correctly configured!
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="alert alert-danger mt-3 mb-0" role="alert">
          Error: {error}
        </div>
      )}
    </div>
  );
}
