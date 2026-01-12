import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { ReimbursementForm } from './components/ReimbursementForm';
import { ReimbursementList } from './components/ReimbursementList';
import { AuditDashboard } from './components/AuditDashboard';
import { UserManagement } from './components/UserManagement';
import { Login } from './components/Login';
import { AppView, SettingsState, ReimbursementItem, User } from './types';
import * as storage from './services/storageService';
import { getCurrentUser, logout } from './services/authService';
import { AlertTriangle, CheckCircle, X, Info } from 'lucide-react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<AppView>(AppView.LOGIN);
  
  // New State for handling List vs Form view within REIMBURSEMENT context
  const [isEditing, setIsEditing] = useState(false);
  
  const [settings, setSettings] = useState<SettingsState>({ 
    storeNames: [],
    projectNames: [],
    companySKUs: [],
    models: [],
    currencies: [],
    paymentMethods: [],
    items: [],
    sources: [],
    transferCommissions: [],
    reviewDropped: [],
    communicationChannels: [],
    paymentCardDigits: [],
    requiredFields: [],
    formConfig: []
  });
  
  const [reimbursements, setReimbursements] = useState<ReimbursementItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Edit mode state
  const [editingItem, setEditingItem] = useState<ReimbursementItem | null>(null);

  // --- Notification System ---
  const [notification, setNotification] = useState<{id: number, message: string, type: 'error' | 'success'} | null>(null);

  const handleNotification = (message: string, type: 'error' | 'success') => {
    // Use timestamp as ID to allow re-triggering the same message animation
    setNotification({ id: Date.now(), message, type });
  };

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000); // Disappear after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load data on mount
  useEffect(() => {
    // Check auth
    const user = getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setCurrentView(AppView.REIMBURSEMENT);
      loadUserData(user);
    } else {
      setLoading(false);
      setCurrentView(AppView.LOGIN);
    }
  }, []);

  const loadUserData = async (user: User) => {
    setLoading(true);
    try {
      const [loadedSettings, loadedItems] = await Promise.all([
        storage.getSettings(),
        storage.getReimbursements(user)
      ]);
      setSettings(loadedSettings);
      setReimbursements(loadedItems);
    } catch (e) {
      console.error("Failed to load user data", e);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = async (user: User) => {
    setCurrentUser(user);
    setCurrentView(AppView.REIMBURSEMENT);
    await loadUserData(user);
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    setCurrentView(AppView.LOGIN);
    setReimbursements([]);
  };

  const handleSettingsSave = async (newSettings: SettingsState) => {
    setSettings(newSettings);
    await storage.saveSettings(newSettings);
    handleNotification("设置已保存", 'success');
  };

  const handleReimbursementSubmit = async (newItem: ReimbursementItem) => {
    // Optimistic update
    setReimbursements((prev) => [newItem, ...prev]);
    await storage.saveReimbursement(newItem);
    // Reload to ensure sync
    if (currentUser) {
        const items = await storage.getReimbursements(currentUser);
        setReimbursements(items);
    }
    // Return to list view
    setIsEditing(false);
    handleNotification("申请单已提交", 'success');
  };
  
  const handleBulkSubmit = async (newItems: ReimbursementItem[]) => {
    setReimbursements((prev) => [...newItems, ...prev]);
    await storage.saveReimbursementsBulk(newItems);
     if (currentUser) {
        const items = await storage.getReimbursements(currentUser);
        setReimbursements(items);
    }
    handleNotification(`成功导入 ${newItems.length} 条记录`, 'success');
  }

  const handleAuditUpdate = async (updatedItem: ReimbursementItem) => {
    setReimbursements((prev) => 
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
    await storage.updateReimbursement(updatedItem);
  };

  const handleEditItem = (item: ReimbursementItem) => {
    setEditingItem(item);
    setIsEditing(true);
    setCurrentView(AppView.REIMBURSEMENT);
  };

  const handleEditCancel = () => {
    setEditingItem(null);
    setIsEditing(false);
  };
  
  const handleChangeView = (view: AppView) => {
    setCurrentView(view);
    setIsEditing(false); // Reset editing state when changing main tabs
    setEditingItem(null);
  }

  if (loading && !currentUser) return <div className="flex h-screen items-center justify-center text-gray-500">Loading system...</div>;

  if (!currentUser || currentView === AppView.LOGIN) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen bg-gray-50 relative">
      {/* Toast Notification Container */}
      {notification && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] w-full max-w-md px-4 animate-fade-in">
           <div className={`w-full p-4 rounded-lg shadow-2xl border flex items-start gap-3 bg-white ${
             notification.type === 'error' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-green-500'
           }`}>
             <div className={`${notification.type === 'error' ? 'text-red-500' : 'text-green-500'} mt-0.5`}>
                {notification.type === 'error' ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
             </div>
             <div className="flex-1">
                <h4 className={`font-bold text-sm ${notification.type === 'error' ? 'text-red-800' : 'text-green-800'}`}>
                    {notification.type === 'error' ? '操作提示 (Notice)' : '成功 (Success)'}
                </h4>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap leading-relaxed">
                    {notification.message}
                </p>
             </div>
             <button onClick={() => setNotification(null)} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                <X size={18} />
             </button>
           </div>
        </div>
      )}

      <Sidebar 
        currentView={currentView} 
        onChangeView={handleChangeView} 
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      
      <main className="ml-64 flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
        <div className="max-w-[98%] mx-auto h-full flex flex-col">
          {currentView === AppView.REIMBURSEMENT && (
             <div className="animate-fade-in h-full flex flex-col">
               {isEditing ? (
                 <>
                   <div className="mb-4">
                     <h1 className="text-2xl font-bold text-gray-800">
                       {editingItem ? '修改申请 (Edit Request)' : '报销申请 (Reimbursement)'}
                     </h1>
                   </div>
                   <ReimbursementForm 
                     settings={settings}
                     currentUser={currentUser} 
                     items={reimbursements} // Pass items for ID generation
                     onSubmit={handleReimbursementSubmit} 
                     onBulkSubmit={handleBulkSubmit}
                     initialData={editingItem}
                     onUpdate={(updatedItem) => {
                       handleAuditUpdate(updatedItem);
                       handleEditCancel();
                       return Promise.resolve();
                     }}
                     onCancelEdit={handleEditCancel}
                     onNotification={handleNotification}
                   />
                 </>
               ) : (
                  <ReimbursementList 
                    items={reimbursements}
                    currentUser={currentUser}
                    settings={settings}
                    onEdit={handleEditItem}
                    onQuickSubmit={handleReimbursementSubmit}
                    onNotification={handleNotification}
                  />
               )}
             </div>
          )}

          {currentView === AppView.AUDIT && (
             <div className="animate-fade-in h-full flex flex-col">
               <AuditDashboard 
                 items={reimbursements} 
                 currentUser={currentUser}
                 onUpdateItem={handleAuditUpdate} 
                 onEditItem={handleEditItem}
               />
             </div>
          )}

          {currentView === AppView.USER_MANAGEMENT && currentUser.role === 'admin' && (
             <div className="animate-fade-in">
               <UserManagement />
             </div>
          )}

          {currentView === AppView.SETTINGS && currentUser.role === 'admin' && (
            <div className="animate-fade-in">
              <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-800">系统设置 (Settings)</h1>
                <p className="text-gray-500 mt-2">Manage dynamic form fields and dropdowns.</p>
              </div>
              <SettingsPanel 
                settings={settings} 
                onSave={handleSettingsSave} 
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;