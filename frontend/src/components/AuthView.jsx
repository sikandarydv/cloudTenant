import { useState } from 'react';
import { login, register, confirmSignUp } from '../services/api';

export default function AuthView({ onAuthSuccess, useLiveCloud }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'confirm'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showDemoTools, setShowDemoTools] = useState(false);

  const handleSignIn = async (e) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login({ email, password, useLiveCloud });
      onAuthSuccess(user);
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters with uppercase, lowercase, and numbers');
      return;
    }

    setLoading(true);
    try {
      await register({ email, password, useLiveCloud });
      setSuccessMsg('Registration successful! Please check your email for the verification code.');
      setMode('confirm');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmSignUp({ email, code, useLiveCloud });
      setSuccessMsg('Email verified! You can now sign in.');
      setMode('signin');
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const loginAsDemoPersona = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('DemoPass123!');
    setError('');
    setLoading(true);
    login({ email: demoEmail, password: 'DemoPass123!', useLiveCloud: false })
      .then((user) => onAuthSuccess(user))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-badge">Enterprise Cloud Platform</div>
          <h2>CloudTenant</h2>
          <p className="auth-subtitle">
            Secure Multi-Tenant SaaS Management Platform
          </p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`tab-btn ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setMode('signin');
              setError('');
              setSuccessMsg('');
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`tab-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup');
              setError('');
              setSuccessMsg('');
            }}
          >
            Create Organization Account
          </button>
          {mode === 'confirm' && (
            <button type="button" className="tab-btn active">
              Verify Code
            </button>
          )}
        </div>

        {error && <div className="alert-box error">{error}</div>}
        {successMsg && <div className="alert-box success">{successMsg}</div>}

        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="auth-form">
            <div className="form-group">
              <label>Work Email</label>
              <input
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Authenticating via Amazon Cognito...' : 'Sign In'}
            </button>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="auth-form">
            <div className="form-group">
              <label>Work Email</label>
              <input
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Password (Min. 8 characters)</label>
              <input
                type="password"
                required
                placeholder="At least 8 chars (Uppercase, lowercase, number)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Confirm Password</label>
              <input
                type="password"
                required
                placeholder="Re-type password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Registering with Amazon Cognito...' : 'Register Organization Account'}
            </button>
          </form>
        )}

        {mode === 'confirm' && (
          <form onSubmit={handleConfirm} className="auth-form">
            <div className="form-group">
              <label>Verification Code</label>
              <input
                type="text"
                required
                placeholder="Enter 6-digit code sent to your email"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Verifying with Cognito...' : 'Confirm Account'}
            </button>
          </form>
        )}

        {/* Discreet Examiner / Viva tools at bottom */}
        <div className="examiner-tools-accordion">
          <button
            type="button"
            className="btn-toggle-examiner"
            onClick={() => setShowDemoTools(!showDemoTools)}
          >
            {showDemoTools ? '▲ Hide Quick Demo Personas' : '▼ Examiner Quick Demo Personas (Optional)'}
          </button>

          {showDemoTools && (
            <div className="demo-personas-box">
              <span className="demo-title">Simulate Pre-Seeded Tenants:</span>
              <div className="persona-buttons">
                <button
                  type="button"
                  className="btn-persona"
                  onClick={() => loginAsDemoPersona('alex.cloud@acme.edu')}
                >
                  🏢 Tenant A (Acme Corp Owner)
                </button>
                <button
                  type="button"
                  className="btn-persona"
                  onClick={() => loginAsDemoPersona('beta.researcher@betalabs.com')}
                >
                  🔒 Tenant B (Beta Labs Isolated)
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="auth-footer">
          <small>
            Powered by Amazon Cognito • DynamoDB Single-Table • AWS Lambda Node.js 24.x • ap-south-1
          </small>
        </div>
      </div>
    </div>
  );
}
