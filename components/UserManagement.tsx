import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { getUsers, saveUser, deleteUser } from '../services/authService';
import { Trash2, UserPlus, Shield, Loader2 } from 'lucide-react';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', chineseName: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    refreshUsers();
  }, []);

  const refreshUsers = async () => {
    setLoading(true);
    const data = await getUsers();
    setUsers(data);
    setLoading(false);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password || !newUser.chineseName) {
      alert("请填写所有必填项 (包括中文名)");
      return;
    }
    
    // Check if user exists
    if (users.find(u => u.username === newUser.username)) {
      alert("用户已存在 (Username exists)");
      return;
    }

    const user: User = {
      id: crypto.randomUUID(),
      username: newUser.username,
      chineseName: newUser.chineseName,
      password: newUser.password,
      role: 'user', // Only create regular users
      createdAt: Date.now(),
    };

    setLoading(true);
    await saveUser(user);
    setNewUser({ username: '', password: '', chineseName: '' });
    await refreshUsers();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("确定删除该用户吗?")) {
      setLoading(true);
      await deleteUser(id);
      await refreshUsers();
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-8 h-8 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-800">用户管理 (User Management)</h2>
        {loading && <Loader2 className="animate-spin text-gray-500" />}
      </div>

      {/* Add User Form */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
          <UserPlus size={20} />
          新增普通用户 (Add User)
        </h3>
        <form onSubmit={handleAddUser} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              用户名 (Username) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. zhangsan01"
              value={newUser.username}
              onChange={e => setNewUser({ ...newUser, username: e.target.value })}
              className="w-full p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              中文名 (Chinese Name) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="例如: 张三"
              value={newUser.chineseName}
              onChange={e => setNewUser({ ...newUser, chineseName: e.target.value })}
              className="w-full p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              密码 (Password) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="******"
              value={newUser.password}
              onChange={e => setNewUser({ ...newUser, password: e.target.value })}
              className="w-full p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full md:w-auto bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 font-bold disabled:opacity-50 transition shadow-sm"
          >
            {loading ? '...' : '添加 (Add)'}
          </button>
        </form>
      </div>

      {/* User List */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-600 text-sm uppercase">
            <tr>
              <th className="p-4">用户名</th>
              <th className="p-4">中文名</th>
              <th className="p-4">密码</th>
              <th className="p-4">角色</th>
              <th className="p-4">创建时间</th>
              <th className="p-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="p-4 font-bold text-gray-800">{user.username}</td>
                <td className="p-4 text-gray-800">{user.chineseName || '-'}</td>
                <td className="p-4 font-mono text-gray-500">{user.password}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {user.role.toUpperCase()}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="p-4 text-right">
                  {user.role !== 'admin' && (
                    <button
                      onClick={() => handleDelete(user.id)}
                      disabled={loading}
                      className="text-red-500 hover:bg-red-50 p-2 rounded-full transition"
                      title="删除用户"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
