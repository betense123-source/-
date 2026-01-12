
import React, { useState } from 'react';
import { ReimbursementItem, User, SettingsState } from '../types';
import { Plus, Edit, FileDown, Image as ImageIcon, MoreHorizontal, Save, X, Upload, Check, Loader2 } from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';
import { generateReimbursementId } from '../services/storageService';

interface ReimbursementListProps {
  items: ReimbursementItem[];
  currentUser: User;
  settings: SettingsState; // Needed for dropdowns
  onEdit: (item: ReimbursementItem) => void;
  onQuickSubmit: (item: ReimbursementItem) => Promise<void>; // New prop for inline save
  onNotification: (message: string, type: 'error' | 'success') => void;
}

// Helper to calculate ISO week number
const getWeekNumber = (d: Date) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil(( ( (d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
  return weekNo;
};

export const ReimbursementList: React.FC<ReimbursementListProps> = ({ items, currentUser, settings, onEdit, onQuickSubmit, onNotification }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // --- Quick Add State ---
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newItem, setNewItem] = useState<Partial<ReimbursementItem>>({});

  // --- Date Parsers ---
  const getDateParts = (ts: number) => {
    const d = new Date(ts);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      week: getWeekNumber(d)
    };
  };

  // --- Selection Logic ---
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(items.map(i => i.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  // --- Quick Add Logic ---
  const startAdd = () => {
    setNewItem({
      storeName: settings.storeNames[0] || '',
      currency: 'USD',
      reportAmountUSD: 0,
      reimburseAmountCNY: 0,
      companySKU: settings.companySKUs[0] || '',
      paymentMethod: settings.paymentMethods[0] || '',
      createdAt: Date.now() // Default to now
    });
    setIsAdding(true);
  };

  const cancelAdd = () => {
    setIsAdding(false);
    setNewItem({});
  };

  const handleInputChange = (field: keyof ReimbursementItem, value: any) => {
    setNewItem(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (field: keyof ReimbursementItem) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewItem(prev => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const submitQuickAdd = async () => {
    if (!newItem.storeName || !newItem.orderId || !newItem.companySKU) {
      onNotification("请填写必要信息: 店铺, 订单号, SKU", 'error');
      return;
    }

    // --- DUPLICATE CHECK ---
    const normalize = (val: any) => String(val || '').trim();
    const orderIdToCheck = normalize(newItem.orderId);
    const reasonToCheck = normalize(newItem.itemReason);

    if (orderIdToCheck && reasonToCheck) {
      const duplicate = items.find(i => 
        normalize(i.orderId) === orderIdToCheck && 
        normalize(i.itemReason) === reasonToCheck
      );

      if (duplicate) {
        onNotification(`⛔️ 提交被阻止 (Submission Blocked)\n\n检测到重复数据：\n订单号: ${orderIdToCheck}\n付款属性: ${reasonToCheck}\n\n该订单已包含此付款属性的记录。同一订单号下，每一类付款属性（如本金、佣金等）只能有一条记录。`, 'error');
        return;
      }
    }
    
    setIsSaving(true);
    try {
      // GENERATE ID using new logic (Initials + Date + Sequence)
      const autoId = generateReimbursementId(currentUser, items);

      const fullItem: ReimbursementItem = {
        ...newItem,
        id: crypto.randomUUID(),
        userId: currentUser.id,
        userName: currentUser.username,
        autoId: autoId,
        status: 'pending',
        createdAt: Date.now(),
        // Defaults for required fields not in quick view
        reimburser: currentUser.username, 
        projectName: '',
        model: newItem.model || '',
        orderAmount: 0,
        commission: 0,
        clientPPAccount: '',
        clientEmail: newItem.clientEmail || '',
        itemReason: newItem.itemReason || '',
        source: '',
        note: newItem.note || '',
        exchangeRate: 0,
        reviewID: '',
        reviewScreenshot: null,
        isTransferCommission: 'No',
        isReviewDropped: 'No',
        communicationChannel: '',
        paymentCardLastDigits: '',
        reviewLink: '',
        clientProfile: '',
      } as ReimbursementItem;

      await onQuickSubmit(fullItem);
      setIsAdding(false);
      setNewItem({});
    } catch (e) {
      onNotification("保存失败", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render Helpers ---
  const ScreenshotCell = ({ url, label }: { url: string | null, label: string }) => {
    if (!url) return <span className="text-gray-300">-</span>;
    return (
      <button 
        onClick={() => setPreviewImage(url)} 
        className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded transition flex items-center gap-1 mx-auto"
        title={label}
      >
        <ImageIcon size={16} />
      </button>
    );
  };
  
  const UploadCell = ({ field, value, label }: { field: keyof ReimbursementItem, value: string | undefined | null, label: string }) => {
     return (
       <div className="relative group flex justify-center w-full">
         <label className={`cursor-pointer w-full p-1.5 rounded border transition flex items-center justify-center ${value ? 'bg-green-50 border-green-300 text-green-600' : 'bg-white border-gray-300 text-gray-400 hover:border-blue-400'}`}>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange(field)} />
            {value ? <Check size={16} /> : <Upload size={16} />}
         </label>
         {value && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 hidden group-hover:block z-50 bg-white shadow-lg border p-1 rounded">
               <img src={value} className="h-16 w-16 object-cover" alt="preview" />
            </div>
         )}
       </div>
     )
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans text-sm shadow-sm border rounded-sm overflow-hidden animate-fade-in">
      
      {/* 1. Top Toolbar */}
      <div className="border-b border-gray-200 p-3 bg-white flex flex-col md:flex-row gap-3 justify-between items-center sticky top-0 z-30">
        
        {/* Left: Action Buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto">
           <button 
             onClick={startAdd}
             disabled={isAdding}
             className={`flex items-center gap-1 px-3 py-1.5 rounded-sm font-bold transition shadow-sm text-sm ${isAdding ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
           >
             <Plus size={16} /> 添加报销单
           </button>
           
           <div className="h-6 w-px bg-gray-300 mx-1"></div>

           <button className="flex items-center gap-1 bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-sm hover:bg-gray-50 font-medium transition text-sm">
             <Edit size={16} /> 批量修改
           </button>

           <button className="flex items-center gap-1 bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-sm hover:bg-gray-50 font-medium transition text-sm">
             <FileDown size={16} /> 导入报销单
           </button>
        </div>

        {/* Right: Stats */}
        <div className="text-gray-500 text-sm">
          已选 <span className="font-bold text-blue-600">{selectedIds.size}</span> 条
        </div>
      </div>

      {/* 2. Main Data Table */}
      <div className="flex-1 overflow-auto bg-gray-50 relative">
        <div className="inline-block min-w-full align-middle">
          <table className="min-w-full divide-y divide-gray-300 border-separate border-spacing-0">
            <thead className="bg-gray-100 sticky top-0 z-20 shadow-sm">
              <tr className="divide-x divide-gray-200">
                <th className="sticky left-0 bg-gray-100 p-2 text-center w-10 z-30 border-r border-gray-200">
                   <input type="checkbox" onChange={handleSelectAll} checked={items.length > 0 && selectedIds.size === items.length} className="w-4 h-4 rounded border-gray-300 text-blue-600"/>
                </th>
                
                <th className="p-2 text-center font-bold text-gray-800 min-w-[60px] whitespace-nowrap">年</th>
                <th className="p-2 text-center font-bold text-gray-800 min-w-[50px] whitespace-nowrap">月</th>
                <th className="p-2 text-center font-bold text-gray-800 min-w-[60px] whitespace-nowrap">周</th>
                
                <th className="p-2 text-left font-bold text-gray-800 min-w-[140px] whitespace-nowrap">店铺</th>
                <th className="p-2 text-left font-bold text-gray-800 min-w-[180px] whitespace-nowrap">订单号</th>
                
                <th className="p-2 text-left font-bold text-gray-800 min-w-[180px] whitespace-nowrap">报销单号</th>
                <th className="p-2 text-left font-bold text-gray-800 min-w-[120px] whitespace-nowrap">SKU</th>
                <th className="p-2 text-left font-bold text-gray-800 min-w-[120px] whitespace-nowrap">Model</th>
                <th className="p-2 text-right font-bold text-gray-800 min-w-[100px] whitespace-nowrap">金额 USD</th>
                <th className="p-2 text-right font-bold text-gray-800 min-w-[100px] whitespace-nowrap">金额 CNY</th>
                <th className="p-2 text-left font-bold text-gray-800 min-w-[120px] whitespace-nowrap">付款方式</th>
                <th className="p-2 text-left font-bold text-gray-800 min-w-[180px] whitespace-nowrap">买家邮箱</th>
                <th className="p-2 text-left font-bold text-gray-800 min-w-[120px] whitespace-nowrap">付款属性</th>
                <th className="p-2 text-center font-bold text-gray-800 min-w-[80px] whitespace-nowrap bg-blue-50/30">PP转账截图</th>
                <th className="p-2 text-center font-bold text-gray-800 min-w-[80px] whitespace-nowrap bg-blue-50/30">信用卡截图</th>
                <th className="p-2 text-center font-bold text-gray-800 min-w-[80px] whitespace-nowrap bg-blue-50/30">订单截图</th>
                <th className="p-2 text-center font-bold text-gray-800 min-w-[80px] whitespace-nowrap bg-blue-50/30">聊天截图</th>
                <th className="p-2 text-left font-bold text-gray-800 min-w-[200px] whitespace-nowrap">备注</th>
                
                <th className="sticky right-0 top-0 z-30 bg-gray-100 p-2 text-center font-bold text-gray-800 w-24 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)] border-l border-gray-200">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm">
              
              {/* --- Quick Add Row --- */}
              {isAdding && (
                 <tr className="bg-blue-50/80 divide-x divide-blue-200 shadow-inner">
                    <td className="sticky left-0 bg-blue-50 p-2 z-20 border-r border-blue-200"></td>
                    
                    <td className="p-2 text-center text-gray-500 text-sm whitespace-nowrap">{getDateParts(Date.now()).year}</td>
                    <td className="p-2 text-center text-gray-500 text-sm whitespace-nowrap">{getDateParts(Date.now()).month}</td>
                    <td className="p-2 text-center text-gray-500 text-sm whitespace-nowrap">W{getDateParts(Date.now()).week}</td>

                    <td className="p-1">
                      <SearchableSelect 
                        value={newItem.storeName || ''}
                        options={settings.storeNames}
                        onChange={(val) => handleInputChange('storeName', val)}
                        autoFocus
                        placeholder="Store"
                        className="text-sm"
                      />
                    </td>
                    <td className="p-1">
                      <input 
                        type="text" 
                        placeholder="Order ID"
                        className="w-full text-sm p-1.5 border border-blue-300 rounded focus:ring-1 focus:ring-blue-500"
                        value={newItem.orderId || ''}
                        onChange={(e) => handleInputChange('orderId', e.target.value)}
                      />
                    </td>
                    
                    <td className="p-2 text-center text-gray-400 text-sm whitespace-nowrap">Auto</td>

                    <td className="p-1">
                      <SearchableSelect 
                        value={newItem.companySKU || ''}
                        options={settings.companySKUs}
                        onChange={(val) => handleInputChange('companySKU', val)}
                        placeholder="SKU"
                        className="text-sm"
                      />
                    </td>

                    <td className="p-1">
                      <SearchableSelect 
                        value={newItem.model || ''}
                        options={settings.models}
                        onChange={(val) => handleInputChange('model', val)}
                        placeholder="Model"
                        className="text-sm"
                      />
                    </td>

                    <td className="p-1">
                       <input type="number" step="0.01" className="w-full text-sm p-1.5 border border-blue-300 rounded text-right" value={newItem.reportAmountUSD || ''} onChange={(e) => handleInputChange('reportAmountUSD', parseFloat(e.target.value))} placeholder="0.00"/>
                    </td>
                    <td className="p-1">
                       <input type="number" step="0.01" className="w-full text-sm p-1.5 border border-blue-300 rounded text-right" value={newItem.reimburseAmountCNY || ''} onChange={(e) => handleInputChange('reimburseAmountCNY', parseFloat(e.target.value))} placeholder="0.00"/>
                    </td>

                    <td className="p-1">
                      <SearchableSelect 
                        value={newItem.paymentMethod || ''}
                        options={settings.paymentMethods}
                        onChange={(val) => handleInputChange('paymentMethod', val)}
                        placeholder="Method"
                        className="text-sm"
                      />
                    </td>

                    <td className="p-1">
                       <input type="email" className="w-full text-sm p-1.5 border border-blue-300 rounded" value={newItem.clientEmail || ''} onChange={(e) => handleInputChange('clientEmail', e.target.value)} placeholder="Email"/>
                    </td>

                    <td className="p-1">
                      <SearchableSelect 
                        value={newItem.itemReason || ''}
                        options={settings.items}
                        onChange={(val) => handleInputChange('itemReason', val)}
                        placeholder="Attr"
                        className="text-sm"
                      />
                    </td>

                    <td className="p-1 text-center"><UploadCell field="ppTransferScreenshotPrincipal" value={newItem.ppTransferScreenshotPrincipal} label="PP"/></td>
                    <td className="p-1 text-center"><UploadCell field="creditCardDeductionScreenshotPrincipal" value={newItem.creditCardDeductionScreenshotPrincipal} label="CC"/></td>
                    <td className="p-1 text-center"><UploadCell field="orderIdScreenshot" value={newItem.orderIdScreenshot} label="Order"/></td>
                    <td className="p-1 text-center"><UploadCell field="chatScreenshot" value={newItem.chatScreenshot} label="Chat"/></td>

                    <td className="p-1">
                       <input type="text" className="w-full text-sm p-1.5 border border-blue-300 rounded" value={newItem.note || ''} onChange={(e) => handleInputChange('note', e.target.value)} placeholder="Note"/>
                    </td>

                    <td className="sticky right-0 bg-blue-50 p-1 text-center z-20 border-l border-blue-200">
                       <div className="flex items-center justify-center gap-2">
                          <button onClick={submitQuickAdd} disabled={isSaving} className="text-green-600 hover:bg-green-100 p-1 rounded">
                             {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                          </button>
                          <button onClick={cancelAdd} className="text-red-500 hover:bg-red-100 p-1 rounded">
                             <X size={18} />
                          </button>
                       </div>
                    </td>
                 </tr>
              )}

              {items.length === 0 && !isAdding ? (
                <tr><td colSpan={20} className="p-8 text-center text-gray-400 text-sm">暂无数据，请点击上方添加</td></tr>
              ) : (
                items.map((item) => {
                  const dateInfo = getDateParts(item.createdAt);
                  const isSelected = selectedIds.has(item.id);
                  const isDangerAttr = item.itemReason === '退款' || item.itemReason === '跑单';
                  
                  return (
                    <tr key={item.id} className={`divide-x divide-gray-100 hover:bg-blue-50/50 transition-colors group ${isSelected ? 'bg-blue-50' : ''}`}>
                      <td className="sticky left-0 bg-white p-2 text-center z-20 border-r border-gray-100 group-hover:bg-blue-50/50">
                         <input 
                           type="checkbox" 
                           checked={isSelected} 
                           onChange={() => handleSelectRow(item.id)}
                           className="w-4 h-4 rounded border-gray-300 text-blue-600"
                         />
                      </td>
                      
                      <td className="p-2 text-center text-gray-600 whitespace-nowrap">{dateInfo.year}</td>
                      <td className="p-2 text-center text-gray-600 whitespace-nowrap">{dateInfo.month}</td>
                      <td className="p-2 text-center text-gray-600 whitespace-nowrap">W{dateInfo.week}</td>

                      <td className="p-2 text-gray-700 whitespace-nowrap" title={item.storeName}>{item.storeName}</td>
                      <td className="p-2 text-blue-600 cursor-text select-all whitespace-nowrap" title={item.orderId}>{item.orderId}</td>
                      
                      
                      <td className="p-2 text-gray-500 text-sm whitespace-nowrap" title={item.autoId}>{item.autoId}</td>
                      <td className="p-2 text-gray-700 whitespace-nowrap" title={item.companySKU}>{item.companySKU}</td>
                      <td className="p-2 text-gray-600 whitespace-nowrap" title={item.model}>{item.model}</td>
                      
                      <td className="p-2 text-right font-mono text-green-700 whitespace-nowrap">{item.reportAmountUSD.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono text-gray-600 whitespace-nowrap">{item.reimburseAmountCNY.toFixed(2)}</td>
                      
                      <td className="p-2 text-gray-600 whitespace-nowrap" title={item.paymentMethod}>{item.paymentMethod}</td>
                      <td className="p-2 text-gray-600 whitespace-nowrap" title={item.clientEmail}>{item.clientEmail}</td>
                      <td className={`p-2 whitespace-nowrap ${isDangerAttr ? 'text-red-600 font-bold' : 'text-gray-600'}`} title={item.itemReason}>{item.itemReason}</td>
                      
                      <td className="p-2 text-center bg-blue-50/10 whitespace-nowrap">
                        <ScreenshotCell url={item.ppTransferScreenshotPrincipal} label="PP Transfer" />
                      </td>
                      <td className="p-2 text-center bg-blue-50/10 whitespace-nowrap">
                        <ScreenshotCell url={item.creditCardDeductionScreenshotPrincipal} label="Credit Card" />
                      </td>
                      <td className="p-2 text-center bg-blue-50/10 whitespace-nowrap">
                        <ScreenshotCell url={item.orderIdScreenshot} label="Order ID" />
                      </td>
                      <td className="p-2 text-center bg-blue-50/10 whitespace-nowrap">
                        <ScreenshotCell url={item.chatScreenshot} label="Chat" />
                      </td>
                      
                      <td className="p-2 text-gray-400 italic whitespace-nowrap" title={item.note}>{item.note || '-'}</td>
                      
                      <td className="sticky right-0 z-20 bg-white p-2 text-center shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)] border-l border-gray-100 group-hover:bg-blue-50/50">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => onEdit(item)} 
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 px-2 py-1 rounded transition"
                          >
                            编辑
                          </button>
                          <button className="text-gray-400 hover:text-gray-600">
                             <MoreHorizontal size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-80 p-4" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-5xl max-h-screen bg-white p-1 rounded shadow-2xl">
             <img src={previewImage} alt="Preview" className="max-h-[90vh] block mx-auto" />
          </div>
        </div>
      )}
    </div>
  );
};
