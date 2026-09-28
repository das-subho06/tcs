import React, { useState } from 'react';
import { api } from '../api';
import { User } from '../types';

interface LoginScreenProps {
  onSuccess: (user: User) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let res;
      if (isRegister) {
        res = await api.register(email, password);
      } else {
        res = await api.login(email, password);
      }
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '60px auto', padding: 24, background: '#1e293b', borderRadius: 8, border: '1px solid #334155' }}>
      <h2 style={{ marginTop: 0, textAlign: 'center', color: '#f8fafc' }}>
        {isRegister ? 'Create an Account' : 'Sign In'}
      </h2>

      {error && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: '#94a3b8' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: '#94a3b8' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff' }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 8,
            padding: 10,
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Please wait...' : isRegister ? 'Register' : 'Sign In'}
        </button>
      </form>

      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
        {isRegister ? 'Already have an account? ' : "Don't have an account? "}
        <button
          type="button"
          onClick={() => { setIsRegister(!isRegister); setError(null); }}
          style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
        >
          {isRegister ? 'Sign In' : 'Register'}
        </button>
      </div>
    </div>
  );
};
