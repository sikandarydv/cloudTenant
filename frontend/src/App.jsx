import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import AuthView from './components/AuthView';
import ProjectsDashboard from './components/ProjectsDashboard';
import TenantModal from './components/TenantModal';
import ProjectModal from './components/ProjectModal';
import IsolationInspector from './components/IsolationInspector';
import {
  getStoredUser,
  logout,
  getTenants,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  isCloudConfigured,
} from './services/api';
import './App.css';

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  // Modals state
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [useLiveCloud, setUseLiveCloud] = useState(() => isCloudConfigured);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load Tenants for authenticated user
  useEffect(() => {
    if (!user) {
      return;
    }
    let isCancelled = false;

    async function fetchTenants() {
      setLoading(true);
      try {
        const list = await getTenants(useLiveCloud);
        if (!isCancelled) {
          setTenants(list);
          setSelectedTenant(list.length > 0 ? list[0] : null);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || 'Failed to load tenants');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchTenants();

    return () => {
      isCancelled = true;
    };
  }, [user, useLiveCloud]);

  // Load Projects for selected tenant
  useEffect(() => {
    if (!selectedTenant?.tenantId) {
      return;
    }
    let isCancelled = false;

    async function fetchProjects() {
      setLoading(true);
      try {
        const projList = await getProjects(selectedTenant.tenantId, useLiveCloud);
        if (!isCancelled) {
          setProjects(projList);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || 'Failed to load projects');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchProjects();

    return () => {
      isCancelled = true;
    };
  }, [selectedTenant?.tenantId, useLiveCloud]);

  const handleAuthSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
    showToast(`Welcome, ${authenticatedUser.email}!`);
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setTenants([]);
    setSelectedTenant(null);
    setProjects([]);
    showToast('Signed out successfully', 'info');
  };

  const handleTenantCreated = (newTenant) => {
    setTenants((prev) => [...prev, newTenant]);
    setSelectedTenant(newTenant);
    showToast(`Tenant "${newTenant.name}" created successfully!`);
  };

  const handleCreateOrUpdateProject = async (projectData) => {
    if (!selectedTenant) return;

    if (editingProject) {
      const updated = await updateProject(
        selectedTenant.tenantId,
        editingProject.projectId,
        projectData,
        useLiveCloud
      );
      setProjects((prev) =>
        prev.map((p) => (p.projectId === updated.projectId ? updated : p))
      );
      showToast(`Project "${updated.name}" updated!`);
    } else {
      const created = await createProject(
        selectedTenant.tenantId,
        projectData,
        useLiveCloud
      );
      setProjects((prev) => [created, ...prev]);
      showToast(`Project "${created.name}" created!`);
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!selectedTenant) return;
    try {
      await deleteProject(selectedTenant.tenantId, projectId, useLiveCloud);
      setProjects((prev) => prev.filter((p) => p.projectId !== projectId));
      showToast('Project deleted successfully');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="app-layout">
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.message}
        </div>
      )}

      <Navbar
        user={user}
        tenants={tenants}
        selectedTenant={selectedTenant}
        onSelectTenant={(t) => setSelectedTenant(t)}
        onOpenCreateTenant={() => setIsTenantModalOpen(true)}
        onOpenInspector={() => setIsInspectorOpen(true)}
        onLogout={handleLogout}
        useLiveCloud={useLiveCloud}
        setUseLiveCloud={setUseLiveCloud}
      />

      <main className="main-content">
        {!user ? (
          <AuthView onAuthSuccess={handleAuthSuccess} useLiveCloud={useLiveCloud} />
        ) : (
          <ProjectsDashboard
            tenant={selectedTenant}
            projects={projects}
            loading={loading}
            error={error}
            onOpenCreateTenant={() => setIsTenantModalOpen(true)}
            onOpenCreateProject={() => {
              setEditingProject(null);
              setIsProjectModalOpen(true);
            }}
            onOpenEditProject={(project) => {
              setEditingProject(project);
              setIsProjectModalOpen(true);
            }}
            onDeleteProject={handleDeleteProject}
          />
        )}
      </main>

      {/* Modals */}
      <TenantModal
        isOpen={isTenantModalOpen}
        onClose={() => setIsTenantModalOpen(false)}
        onTenantCreated={handleTenantCreated}
        useLiveCloud={useLiveCloud}
      />

      <ProjectModal
        key={editingProject ? editingProject.projectId : isProjectModalOpen ? 'create' : 'closed'}
        isOpen={isProjectModalOpen}
        onClose={() => {
          setIsProjectModalOpen(false);
          setEditingProject(null);
        }}
        onSubmit={handleCreateOrUpdateProject}
        initialProject={editingProject}
        tenantName={selectedTenant?.name}
      />

      <IsolationInspector
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        currentUser={user}
        currentTenant={selectedTenant}
        useLiveCloud={useLiveCloud}
      />

      <footer className="footer">
        <p>
          CloudTenant — Multi-Tenant SaaS Platform • AWS SAM, Lambda (Node.js 24.x), DynamoDB Single-Table, API Gateway & Cognito (ap-south-1)
        </p>
      </footer>
    </div>
  );
}
