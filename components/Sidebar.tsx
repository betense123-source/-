import React from 'react';
import { LayoutDashboard, FileText, Settings, ShieldCheck, Users, LogOut } from 'lucide-react';
import { AppView, User } from '../types';

interface SidebarProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
  currentUser: User | null;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, currentUser, onLogout }) => {
  if (!currentUser) return null; // No sidebar for login screen

  const navItems = [
    { id: AppView.REIMBURSEMENT, label: '报销申请 (Apply)', icon: FileText, roles: ['admin', 'user'] },
    { id: AppView.AUDIT, label: currentUser.role === 'admin' ? '审核管理 (Audit)' : '申请记录 (History)', icon: ShieldCheck, roles: ['admin', 'user'] },
    { id: AppView.USER_MANAGEMENT, label: '用户管理 (Users)', icon: Users, roles: ['admin'] },
    { id: AppView.SETTINGS, label: '表单设置 (Settings)', icon: Settings, roles: ['admin'] },
  ];

  const handleLogout = () => {
    // Calling the parent handler directly. 
    // Logic for clearing token/state is handled in App.tsx handleLogout.
    onLogout();
  };

  return (
    <div className="w-64 bg-slate-800 text-white h-screen flex flex-col fixed left-0 top-0 overflow-y-auto shadow-xl z-50">
      <div className="p-6 border-b border-slate-700 flex items-center gap-2">
        <LayoutDashboard className="w-6 h-6 text-blue-400" />
        <h1 className="text-xl font-bold">ReimburseSys</h1>
      </div>
      
      <div className="p-4 border-b border-slate-700 bg-slate-900/50">
        <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Welcome</div>
        <div className="font-medium text-white flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-green-500"></div>
           {currentUser.username}
        </div>
        <div className="text-xs text-slate-500 mt-0.5 capitalize">{currentUser.role} Account</div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.filter(item => item.roles.includes(currentUser.role)).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChangeView(item.id as AppView)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
              currentView === item.id
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
      
      <div className="p-4 border-t border-slate-700">
        <button 
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">退出登录 (Logout)</span>
        </button>
        <div className="mt-4 text-xs text-slate-500 text-center">
          &copy; 2024 Corporate Finance
        </div>
      </div>
    </div>
  );
};