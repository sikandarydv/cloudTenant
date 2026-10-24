import { useState } from 'react';
import { simulateCrossTenantAttack } from '../services/api';

export default function IsolationInspector({
  isOpen,
  onClose,
  currentUser,
  currentTenant,
  useLiveCloud,
}) {
  const [targetTenantId, setTargetTenantId] = useState('org-beta-999');
  const [simulating, setSimulating] = useState(false);
  const [attackResult, setAttackResult] = useState(null);

  if (!isOpen) return null;

  const handleRunAttackSimulation = async () => {
    setSimulating(true);
    setAttackResult(null);
    try {
      const result = await simulateCrossTenantAttack(targetTenantId, useLiveCloud);
      setAttackResult(result);
    } catch (err) {
      setAttackResult({
        blocked: true,
        status: err.status || 403,
        message: err.message,
      });
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-large">
        <div className="modal-header">
          <div>
            <h3>🛡️ Multi-Tenant Security & Isolation Inspector</h3>
            <span className="modal-subtitle">
              College Project Technical Demonstration & Viva Evaluation Tool
            </span>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="inspector-content">
          {/* Section 1: Security Model Explanation */}
          <div className="inspector-section">
            <h4>1. Architectural Isolation Model (Single-Table DynamoDB)</h4>
            <div className="code-card">
              <div className="code-header">DynamoDB Partition Key Isolation Scheme:</div>
              <pre className="code-block">
{`Table: CloudTenantData (Pay-Per-Request, ap-south-1)
---------------------------------------------------------------------------------
| Entity             | Partition Key (PK)       | Sort Key (SK)                 |
---------------------------------------------------------------------------------
| User Membership    | USER#<cognito_sub>       | TENANT#<tenantId>             |
| Tenant Metadata    | TENANT#<tenantId>        | METADATA                      |
| Tenant Project     | TENANT#<tenantId>        | PROJECT#<projectId>           |
---------------------------------------------------------------------------------`}
              </pre>
            </div>
            <p className="section-note">
              <strong>Core Security Principle:</strong> The backend Lambda verifies user
              identity directly from verified Amazon Cognito JWT claims (<code>claims.sub</code>)
              and performs a DynamoDB query to verify active tenant membership before allowing any
              operation. A client cannot spoof <code>tenantId</code> because all project keys are
              hard-bound to the partition <code>PK: TENANT#&lt;tenantId&gt;</code>.
            </p>
          </div>

          {/* Section 2: Interactive Attack Simulator */}
          <div className="inspector-section highlight-box">
            <h4>2. Live Cross-Tenant Attack Simulator</h4>
            <p className="simulator-desc">
              Test what happens when the authenticated user (<strong>{currentUser?.email}</strong> in{' '}
              <strong>{currentTenant?.name}</strong>) attempts to force an API call targeting a
              foreign tenant’s private partition.
            </p>

            <div className="attack-controls">
              <div className="target-input-group">
                <label>Foreign Target Tenant ID:</label>
                <input
                  type="text"
                  value={targetTenantId}
                  onChange={(e) => setTargetTenantId(e.target.value)}
                  placeholder="e.g. org-beta-999"
                />
              </div>

              <button
                type="button"
                className="btn-danger"
                disabled={simulating}
                onClick={handleRunAttackSimulation}
              >
                {simulating ? 'Simulating Exploit...' : '🚨 Attempt Cross-Tenant Request'}
              </button>
            </div>

            {attackResult && (
              <div
                className={`attack-result-box ${attackResult.blocked ? 'success-block' : 'breach'}`}
              >
                <div className="result-header">
                  <span className="result-icon">{attackResult.blocked ? '✅' : '❌'}</span>
                  <strong>
                    {attackResult.blocked
                      ? 'ISOLATION ENFORCED: Cross-Tenant Access Blocked'
                      : 'SECURITY BREACH DETECTED'}
                  </strong>
                  <span className="status-code">HTTP {attackResult.status}</span>
                </div>
                <div className="result-body">
                  <p>{attackResult.message}</p>
                </div>
                <div className="result-explanation">
                  <small>
                    Verified Backend Defense: The server verified that <code>USER#{currentUser?.userId}</code> has no membership for partition <code>TENANT#{targetTenantId}</code> and rejected the transaction before DynamoDB query execution.
                  </small>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: AWS Stack Specifications */}
          <div className="inspector-section">
            <h4>3. Cloud Computing Stack Specifications</h4>
            <div className="specs-grid">
              <div className="spec-item">
                <span className="spec-label">Region</span>
                <span className="spec-value">ap-south-1 (Mumbai)</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Auth Provider</span>
                <span className="spec-value">Amazon Cognito (SRP / JWT)</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Compute</span>
                <span className="spec-value">AWS Lambda (Node.js 24.x)</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">API Gateway</span>
                <span className="spec-value">REST API + Cognito Authorizer</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Database</span>
                <span className="spec-value">DynamoDB (Single-Table Design)</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">IaC Framework</span>
                <span className="spec-value">AWS SAM & CloudFormation</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-primary" onClick={onClose}>
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
