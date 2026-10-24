import { useState } from 'react';

export default function ProjectsDashboard({
  tenant,
  projects,
  loading,
  error,
  onOpenCreateProject,
  onOpenEditProject,
  onDeleteProject,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  // Statistics calculation
  const totalCount = projects.length;
  const activeCount = projects.filter((p) => p.status === 'Active').length;
  const planningCount = projects.filter((p) => p.status === 'Planning').length;
  const completedCount = projects.filter((p) => p.status === 'Completed').length;
  const totalBudget = projects.reduce((acc, p) => acc + (Number(p.budget) || 0), 0);

  // Filter logic
  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusClass = (status) => {
    switch (status) {
      case 'Active':
        return 'badge-active';
      case 'Planning':
        return 'badge-planning';
      case 'Completed':
        return 'badge-completed';
      case 'On Hold':
        return 'badge-onhold';
      default:
        return '';
    }
  };

  const getPriorityClass = (priority) => {
    switch (priority) {
      case 'Critical':
        return 'badge-critical';
      case 'High':
        return 'badge-high';
      case 'Medium':
        return 'badge-medium';
      case 'Low':
        return 'badge-low';
      default:
        return '';
    }
  };

  return (
    <div className="dashboard-container">
      {/* Tenant Banner */}
      <div className="tenant-banner">
        <div className="tenant-banner-details">
          <div className="tenant-headline">
            <h2>{tenant?.name || 'Selected Tenant'}</h2>
            <span className="badge-pill role">{tenant?.role || 'Owner'}</span>
            <span className="badge-pill tier">{tenant?.plan || 'Standard Tier'}</span>
          </div>
          <div className="tenant-meta-row">
            <span>
              Partition: <code>PK: TENANT#{tenant?.tenantId}</code>
            </span>
            <span>•</span>
            <span>Region: <strong>ap-south-1 (Mumbai)</strong></span>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary btn-large"
          onClick={onOpenCreateProject}
        >
          + New Project
        </button>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Total Projects</div>
          <div className="metric-value">{totalCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Active Deployments</div>
          <div className="metric-value text-emerald">{activeCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">In Planning</div>
          <div className="metric-value text-sky">{planningCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Completed</div>
          <div className="metric-value text-purple">{completedCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Budget Allocated</div>
          <div className="metric-value text-amber">${totalBudget.toLocaleString()}</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="controls-bar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search projects in this tenant..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="clear-search"
              onClick={() => setSearchTerm('')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="filter-tabs">
          {['ALL', 'Active', 'Planning', 'Completed', 'On Hold'].map((status) => (
            <button
              key={status}
              type="button"
              className={`filter-tab ${statusFilter === status ? 'active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert-box error">{error}</div>}

      {/* Projects Grid / List */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading isolated tenant records from DynamoDB...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3>No Projects Found</h3>
          <p>
            {searchTerm || statusFilter !== 'ALL'
              ? 'No projects match your filter criteria.'
              : 'This tenant currently has no projects. Click "+ New Project" above to create one.'}
          </p>
          {(searchTerm || statusFilter !== 'ALL') && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="projects-grid">
          {filteredProjects.map((project) => (
            <div key={project.projectId} className="project-card">
              <div className="project-card-header">
                <div>
                  <h4 className="project-title">{project.name}</h4>
                  <div className="project-id-tag">
                    <code>SK: PROJECT#{project.projectId}</code>
                  </div>
                </div>
                <div className="project-badges">
                  <span className={`status-badge ${getStatusClass(project.status)}`}>
                    {project.status}
                  </span>
                  <span className={`priority-badge ${getPriorityClass(project.priority)}`}>
                    {project.priority}
                  </span>
                </div>
              </div>

              <p className="project-desc">{project.description || 'No description provided.'}</p>

              <div className="project-card-meta">
                <div className="meta-item">
                  <span className="meta-label">Budget</span>
                  <span className="meta-val">${(Number(project.budget) || 0).toLocaleString()}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Created By</span>
                  <span className="meta-val">{project.creatorEmail || project.createdBy || 'User'}</span>
                </div>
              </div>

              <div className="project-card-footer">
                <div className="project-actions">
                  <button
                    type="button"
                    className="btn-action edit"
                    onClick={() => onOpenEditProject(project)}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    className="btn-action delete"
                    onClick={() => setDeleteCandidate(project)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteCandidate && (
        <div className="modal-backdrop">
          <div className="modal-card modal-small">
            <div className="modal-header">
              <h3>Confirm Project Deletion</h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setDeleteCandidate(null)}
              >
                ✕
              </button>
            </div>
            <p>
              Are you sure you want to delete project{' '}
              <strong>"{deleteCandidate.name}"</strong>?
            </p>
            <p className="delete-warning">
              This will remove the item with key{' '}
              <code>SK: PROJECT#{deleteCandidate.projectId}</code> from partition{' '}
              <code>PK: TENANT#{tenant?.tenantId}</code>.
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteCandidate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={async () => {
                  await onDeleteProject(deleteCandidate.projectId);
                  setDeleteCandidate(null);
                }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
