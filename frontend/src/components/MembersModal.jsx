import { useState, useEffect } from 'react';
import { getMembers, addMember } from '../services/api';

export default function MembersModal({
  isOpen,
  onClose,
  tenant,
  useLiveCloud,
  showToast,
}) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isOwnerOrAdmin = tenant?.role === 'Owner' || tenant?.role === 'Admin';

  useEffect(() => {
    if (!isOpen || !tenant?.tenantId) return;
    let isCancelled = false;

    async function fetchMembers() {
      setLoading(true);
      setError('');
      try {
        const list = await getMembers(tenant.tenantId, useLiveCloud);
        if (!isCancelled) {
          setMembers(list);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || 'Failed to load tenant members');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchMembers();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, tenant?.tenantId, useLiveCloud]);

  if (!isOpen) return null;

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      setError('Member email is required');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const added = await addMember(
        tenant.tenantId,
        {
          userId: inviteEmail.trim(),
          email: inviteEmail.trim(),
          role: inviteRole,
        },
        useLiveCloud
      );
      setMembers((prev) => [...prev, added.member || added]);
      setInviteEmail('');
      setInviteRole('Member');
      showToast(`Added ${inviteEmail} as ${inviteRole}!`);
    } catch (err) {
      setError(err.message || 'Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-large">
        <div className="modal-header">
          <div>
            <h3>👥 Organization Members</h3>
            <span className="modal-subtitle">
              Manage team access for <strong>{tenant?.name}</strong> (Your Role: <strong>{tenant?.role}</strong>)
            </span>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="alert-box error">{error}</div>}

        {/* Member Invitation Form (Only for Owner & Admin) */}
        {isOwnerOrAdmin ? (
          <form onSubmit={handleAddMember} className="invite-member-form">
            <div className="invite-inputs-row">
              <div className="form-group flex-2">
                <label>User Email to Invite</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. colleague@acme.edu"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>

              <div className="form-group flex-1">
                <label>Assigned Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="Member">Member (Project Collaborator)</option>
                  <option value="Admin">Admin (Can Manage Members)</option>
                </select>
              </div>

              <button
                type="submit"
                className="btn-primary btn-invite-submit"
                disabled={submitting}
              >
                {submitting ? 'Adding...' : '+ Add Member'}
              </button>
            </div>
          </form>
        ) : (
          <div className="alert-box info-box">
            ℹ️ You are signed in with the <strong>Member</strong> role. Only tenant <strong>Owners</strong> and <strong>Admins</strong> can invite new members.
          </div>
        )}

        {/* Current Members List */}
        <div className="members-section">
          <h4>Active Members in this Organization</h4>
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading members...</p>
            </div>
          ) : members.length === 0 ? (
            <p className="no-members">No other members in this tenant yet.</p>
          ) : (
            <div className="members-list">
              {members.map((m, idx) => (
                <div key={m.userId || idx} className="member-item">
                  <div className="member-avatar">
                    {(m.email || m.userId || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="member-info">
                    <div className="member-email">{m.email || m.userId}</div>
                    <div className="member-joined">
                      Joined: {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : 'Active'}
                    </div>
                  </div>
                  <div className="member-role-badge">
                    <span className={`badge-pill role ${m.role === 'Owner' ? 'owner-badge' : m.role === 'Admin' ? 'admin-badge' : 'member-badge'}`}>
                      {m.role || 'Member'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
