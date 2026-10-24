import { isCloudConfigured } from '../services/api';

export default function Navbar({
  user,
  tenants,
  selectedTenant,
  onSelectTenant,
  onOpenCreateTenant,
  onOpenInspector,
  onLogout,
  useLiveCloud,
  setUseLiveCloud,
}) {
  return (
    <header className="navbar">
      <div className="nav-container">
        <div className="nav-brand">
          <div className="logo-icon">☁️</div>
          <div>
            <div className="brand-title">CloudTenant</div>
            <div className="brand-subtitle">Multi-Tenant SaaS Management</div>
          </div>
        </div>

        {user && (
          <div className="nav-center">
            <div className="tenant-selector-box">
              <span className="selector-label">Tenant:</span>
              <select
                className="tenant-dropdown"
                value={selectedTenant?.tenantId || ''}
                onChange={(e) => {
                  const target = tenants.find((t) => t.tenantId === e.target.value);
                  if (target) onSelectTenant(target);
                }}
              >
                {tenants.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    {t.name} ({t.role || 'Member'})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-icon"
                title="Create New Organization/Tenant"
                onClick={onOpenCreateTenant}
              >
                +
              </button>
            </div>
          </div>
        )}

        <div className="nav-actions">
          {/* Isolation Inspector Button */}
          <button
            type="button"
            className="btn-inspector"
            onClick={onOpenInspector}
            title="Inspect Multi-Tenant DynamoDB Partition Isolation"
          >
            🛡️ Isolation Inspector
          </button>

          {/* Cloud vs Demo Mode Toggle */}
          <button
            type="button"
            className="mode-pill-badge clickable"
            title={
              isCloudConfigured
                ? 'Click to toggle between AWS Mumbai and Local Mock Mode'
                : 'AWS Cloud credentials not yet set in .env (Running in Local Demo Mode)'
            }
            onClick={() => {
              if (isCloudConfigured) {
                setUseLiveCloud(!useLiveCloud);
              }
            }}
          >
            <span
              className={`status-dot ${
                useLiveCloud && isCloudConfigured ? 'green' : 'amber'
              }`}
            ></span>
            <span>
              {useLiveCloud && isCloudConfigured
                ? 'AWS Mumbai (Live)'
                : 'Local / Demo Mode'}
            </span>
          </button>

          {user ? (
            <div className="user-profile">
              <div className="user-avatar" title={user.email}>
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div className="user-info-text">
                <span className="user-email">{user.email}</span>
                <button type="button" className="btn-logout" onClick={onLogout}>
                  Sign Out
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
