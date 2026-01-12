import React, { useState } from 'react';
import { login } from '../services/authService';
import { User } from '../types';
import { Lock, User as UserIcon, Loader2, Database } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const user = await login(username, password);
      if (user) {
        onLoginSuccess(user);
      } else {
        setError('用户名或密码错误 / Invalid username or password');
      }
    } catch (e) {
      setError('系统错误 / System error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 flex-col gap-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 relative overflow-hidden">
        
        <div className="text-center mb-8">
          <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Smart Reimburse AI</h1>
          <p className="text-gray-500 text-sm mt-2">请登录系统 / Please Login</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg text-center border border-red-200">
              {error}
            </div>
          )}
          
          <div className="relative">
            <UserIcon className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
            <input
              type="text"
              required
              placeholder="Username (e.g. admin)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-bold py-3 rounded-lg transition shadow-lg flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : '登录 / Login'}
          </button>
        </form>
        
        <div className="mt-6 flex justify-between items-center text-xs text-gray-400">
          <div>Default Admin: admin / admin</div>
        </div>
      </div>

      {/* System Mode Indicator */}
      <div className="w-full max-w-md p-3 rounded-lg border flex items-center gap-3 text-xs shadow-sm bg-gray-50 text-gray-600 border-gray-200">
        <Database className="w-4 h-4 text-blue-500" />
        <span>Mode: <b>Local Storage</b> (Data saved in browser only)</span>
      </div>
    </div>
  );
};