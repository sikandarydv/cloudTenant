import { useState } from 'react';
import { createTenant } from '../services/api';

export default function TenantModal({ isOpen, onClose, onTenantCreated, useLiveCloud }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState('Standard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Tenant name is required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const newTenant = await createTenant({ name: name.trim(), description: description.trim(), plan }, useLiveCloud);
      onTenantCreated(newTenant);
      setName('');
      setDescription('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create tenant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <h3>Create New Organization / Tenant</h3>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="alert-box error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Organization / Tenant Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Nexus Innovations"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              rows="3"
              placeholder="Brief description of this workspace"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Subscription Tier</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="Starter">Starter (Shared Compute)</option>
              <option value="Standard">Standard (Multi-AZ)</option>
              <option value="Enterprise">Enterprise (Dedicated Provisioned)</option>
            </select>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating Tenant...' : 'Create Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
