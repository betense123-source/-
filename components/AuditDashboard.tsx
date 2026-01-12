
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ReimbursementItem, User } from '../types';
import { performFullAudit, getApiKey } from '../services/geminiService';
import { Check, X, Loader2, Sparkles, Filter, DollarSign, CreditCard, Hash, Image as ImageIcon, Search } from 'lucide-react';

interface AuditDashboardProps {
  items: ReimbursementItem[];
  currentUser: User;
  onUpdateItem: (item: ReimbursementItem) => Promise<void>;
  onEditItem: (item: ReimbursementItem) => void;
}

// Helper to calculate ISO week number (Same as ReimbursementList)
const getWeekNumber = (d: Date) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil(( ( (d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
  return weekNo;
};

// --- Value Extractor for Filtering ---
const getItemValue = (item: ReimbursementItem, key: string): string => {
  const d = new Date(item.createdAt);
  switch (key) {
    case 'year': return d.getFullYear().toString();
    case 'month': return (d.getMonth() + 1).toString();
    case 'week': return 'W' + getWeekNumber(d).toString();
    case 'reportAmountUSD': return item.reportAmountUSD.toFixed(2);
    case 'reimburseAmountCNY': return item.reimburseAmountCNY.toFixed(2);
    case 'status': 
      if (item.status === 'approved') return '已通过';
      if (item.status === 'rejected') return '已驳回';
      return '待审核';
    default:
      // @ts-ignore
      return String(item[key] || '').trim();
  }
};

export const AuditDashboard: React.FC<AuditDashboardProps> = ({ items, currentUser, onUpdateItem, onEditItem }) => {
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // --- New Excel-like Filtering State ---
  // Key = Column Key, Value = Set of ALLOWED values. If key missing, all allowed.
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<string>>>({});
  
  // Filter Dropdown UI State
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0 });
  const filterBtnRef = useRef<HTMLButtonElement | null>(null);

  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // --- Bulk Audit State ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);

  const isAdmin = currentUser.role === 'admin';

  // --- Date Parsers ---
  const getDateParts = (ts: number) => {
    const d = new Date(ts);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      week: getWeekNumber(d)
    };
  };

  // --- Filter Logic ---
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Iterate over all active filters
      for (const [colKey, allowedSet] of Object.entries(activeFilters)) {
        const val = getItemValue(item, colKey);
        // Cast allowedSet to Set<string> to avoid "Property 'has' does not exist on type 'unknown'" error
        if (!(allowedSet as Set<string>).has(val)) {
          return false;
        }
      }
      return true;
    });
  }, [items, activeFilters]);

  // Get unique values for a column (from ALL items, not just filtered, to replicate Excel behavior)
  const getUniqueValues = (colKey: string) => {
    const values = new Set<string>();
    items.forEach(item => {
      values.add(getItemValue(item, colKey));
    });
    return Array.from(values).sort();
  };

  // --- Filter UI Handlers ---
  const handleFilterClick = (e: React.MouseEvent, colKey: string) => {
    e.stopPropagation();
    if (openFilterCol === colKey) {
      setOpenFilterCol(null);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setFilterPosition({ top: rect.bottom + 5, left: rect.left });
      setOpenFilterCol(colKey);
    }
  };

  const applyFilter = (colKey: string, newSet: Set<string> | null) => {
    setActiveFilters(prev => {
      const next = { ...prev };
      if (!newSet || newSet.size === 0) {
        delete next[colKey]; // Remove filter
      } else {
        next[colKey] = newSet;
      }
      return next;
    });
    setOpenFilterCol(null);
  };

  // --- Selection Logic ---
  const isAllSelected = filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.id));

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSet = new Set(selectedIds);
    if (e.target.checked) {
      filteredItems.forEach(i => newSet.add(i.id));
    } else {
      filteredItems.forEach(i => newSet.delete(i.id));
    }
    setSelectedIds(newSet);
  };

  const handleSelectRow = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // --- Core Audit Logic ---
  const runAuditForItem = async (item: ReimbursementItem, explicitKey?: string): Promise<ReimbursementItem> => {
    const hasMainProof = !!item.ppTransferScreenshotPrincipal;
    const hasOrderProof = !!item.orderIdScreenshot;

    if (!hasMainProof && !hasOrderProof) {
      throw new Error("无截图 (No Screenshots)");
    }

    try {
      const result = await performFullAudit(
        item.reportAmountUSD, 
        item.ppTransferScreenshotPrincipal,
        item.reimburseAmountCNY,
        item.creditCardDeductionScreenshotPrincipal,
        item.orderId,
        item.orderIdScreenshot || null, 
        explicitKey
      );
      
      let newStatus: 'approved' | 'rejected' | 'pending' = 'pending';
      const usdOk = result.usdCheck.verified;
      const cnyOk = result.cnyCheck.verified;
      const orderOk = result.orderCheck.verified;
      const cnyAttempted = !!item.creditCardDeductionScreenshotPrincipal;

      if (!usdOk && result.usdCheck.extractedAmount !== null) {
        newStatus = 'rejected';
      } else if (!orderOk && result.orderCheck.extractedText) {
        newStatus = 'rejected';
      } else if (cnyAttempted && !cnyOk && result.cnyCheck.extractedAmount !== null) {
        newStatus = 'rejected';
      } else if (usdOk && orderOk && (!cnyAttempted || cnyOk)) {
        newStatus = 'approved';
      }

      return { ...item, auditResult: result, status: newStatus };
    } catch (e) {
      throw e;
    }
  };

  // --- Bulk Handler ---
  const handleBulkVerify = async () => {
    const selectedList = items.filter(i => selectedIds.has(i.id));
    if (selectedList.length === 0) {
      alert("请先勾选需要核对的记录！");
      return;
    }

    let apiKey = getApiKey();
    if (!apiKey) {
      const input = window.prompt("⚠️ 请输入 Gemini API Key：");
      if (!input || !input.trim()) return;
      apiKey = input.trim();
    }

    setIsProcessing(true);
    setBulkStatus(`🚀 准备开始核对 ${selectedList.length} 条...`);
    
    let sCount = 0;
    let fCount = 0;

    for (let i = 0; i < selectedList.length; i++) {
      const item = selectedList[i];
      const currentIndex = i + 1;
      setBulkStatus(`⏳ [${currentIndex}/${selectedList.length}] 正在核对: ${item.reimburser}...`);
      try {
        if (i > 0) await new Promise(r => setTimeout(r, 1500));
        const updated = await runAuditForItem(item, apiKey);
        await onUpdateItem(updated);
        sCount++;
        setBulkStatus(`✅ [${currentIndex}/${selectedList.length}] 成功 (ID: ${item.autoId})`);
      } catch (err: any) {
        fCount++;
        setBulkStatus(`❌ [${currentIndex}/${selectedList.length}] 失败: ${err.message}`);
      }
    }

    setIsProcessing(false);
    setBulkStatus(`🏁 完成！成功: ${sCount}, 失败: ${fCount}`);
    if (sCount > 0) setSelectedIds(new Set());
    setTimeout(() => setBulkStatus(null), 5000);
  };

  const handleVerifySingle = async (item: ReimbursementItem) => {
    if (!isAdmin) return;
    let key = getApiKey();
    if (!key) {
      const input = prompt("请输入 API Key:");
      if (!input) return;
      key = input.trim();
    }
    setVerifyingId(item.id);
    try {
      const updated = await runAuditForItem(item, key);
      await onUpdateItem(updated);
    } catch (e: any) {
      alert(`核对失败: ${e.message}`);
    } finally {
      setVerifyingId(null);
    }
  };

  const updateStatus = async (item: ReimbursementItem, status: 'approved' | 'rejected') => {
    if (!isAdmin) return;
    setLoadingAction(item.id);
    try {
       await onUpdateItem({ ...item, status });
    } finally {
       setLoadingAction(null);
    }
  };

  const clearAllFilters = () => {
    setActiveFilters({});
  };

  // Compact Audit Result
  const CompactAuditResult = ({ result, icon: Icon, onClick }: any) => {
    if (!result) return <div className="w-5 h-5 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center text-gray-300" title="待核对"><Icon size={10} /></div>;
    const colorClass = result.verified ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300';
    return (
      <div onClick={onClick} className={`w-6 h-6 rounded flex items-center justify-center border cursor-pointer hover:scale-110 transition-transform ${colorClass}`} title={result.reason}>
        {result.verified ? <Check size={14} /> : <X size={14} />}
      </div>
    );
  };
  
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

  // Width config for sticky columns
  const COL_WIDTH_OPERATION = 90;
  const COL_WIDTH_RESULT = 90;
  const COL_WIDTH_AI = 130;
  
  const RIGHT_POS_RESULT = COL_WIDTH_OPERATION; 
  const RIGHT_POS_AI = COL_WIDTH_OPERATION + COL_WIDTH_RESULT; 

  // --- Filter Dropdown Component ---
  const FilterDropdown = ({ colKey }: { colKey: string }) => {
    const allValues = useMemo(() => getUniqueValues(colKey), [colKey]);
    const currentFilter = activeFilters[colKey]; // If undefined, means All selected
    
    // Local state for the dropdown before applying
    const [tempSelected, setTempSelected] = useState<Set<string>>(
      currentFilter ? new Set(currentFilter) : new Set(allValues)
    );
    const [searchTerm, setSearchTerm] = useState('');

    const filteredOptions = allValues.filter(v => v.toLowerCase().includes(searchTerm.toLowerCase()));

    const toggleVal = (val: string) => {
      const newSet = new Set(tempSelected);
      if (newSet.has(val)) newSet.delete(val);
      else newSet.add(val);
      setTempSelected(newSet);
    };

    const handleSelectAllInView = () => {
      setTempSelected(new Set([...Array.from(tempSelected), ...filteredOptions]));
    };

    const handleClearInView = () => {
      const newSet = new Set(tempSelected);
      filteredOptions.forEach(v => newSet.delete(v));
      setTempSelected(newSet);
    };

    const handleOk = () => {
      // If all values are selected, we can just remove the filter to keep it clean, or store explicitly.
      // Usually removing filter is better for performance if set == allValues
      if (tempSelected.size === allValues.length && allValues.length > 0) {
        applyFilter(colKey, null); // Clear filter
      } else {
        applyFilter(colKey, tempSelected);
      }
    };

    return (
      <div 
        className="fixed z-[100] w-64 bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col animate-fade-in"
        style={{ top: filterPosition.top, left: filterPosition.left }}
      >
        <div className="p-2 border-b border-gray-100">
           <div className="relative">
             <Search size={14} className="absolute left-2 top-2 text-gray-400"/>
             <input 
               autoFocus
               className="w-full pl-7 pr-2 py-1 text-sm border border-gray-200 rounded bg-gray-50 focus:bg-white focus:border-blue-400 outline-none"
               placeholder="搜索..."
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
             />
           </div>
        </div>
        
        <div className="flex-1 overflow-y-auto max-h-60 p-1">
           <div className="flex gap-2 px-2 py-1 mb-1 text-xs text-blue-600">
             <button onClick={handleSelectAllInView} className="hover:underline">全选</button>
             <button onClick={handleClearInView} className="hover:underline">清空</button>
           </div>
           {filteredOptions.length === 0 ? (
             <div className="text-center text-gray-400 text-xs py-4">无匹配项</div>
           ) : (
             filteredOptions.map(val => (
               <label key={val} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm">
                 <input 
                   type="checkbox" 
                   checked={tempSelected.has(val)} 
                   onChange={() => toggleVal(val)}
                   className="rounded text-blue-600 focus:ring-blue-500"
                 />
                 <span className="truncate" title={val}>{val || '(Empty)'}</span>
               </label>
             ))
           )}
        </div>

        <div className="p-2 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-lg">
          <button 
            onClick={() => setOpenFilterCol(null)}
            className="px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded"
          >
            取消
          </button>
          <button 
            onClick={handleOk}
            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm"
          >
            确定
          </button>
        </div>
      </div>
    );
  };

  // --- Header Wrapper Component ---
  const FilterHeader = ({ label, colKey, width }: { label: string, colKey: string, width?: string }) => {
    const isActive = activeFilters[colKey] !== undefined;
    return (
      <th className={`p-2 text-left font-bold whitespace-nowrap group relative ${width || ''}`}>
        <div className="flex items-center justify-between gap-1">
          <span>{label}</span>
          <button 
             onClick={(e) => handleFilterClick(e, colKey)}
             className={`p-0.5 rounded transition-colors ${
               isActive ? 'text-blue-600 bg-blue-100' : 'text-gray-300 group-hover:text-gray-500 hover:bg-gray-100'
             }`}
          >
            <Filter size={12} fill={isActive ? "currentColor" : "none"} />
          </button>
        </div>
      </th>
    );
  };

  const CenterFilterHeader = ({ label, colKey, width }: { label: string, colKey: string, width?: string }) => {
    const isActive = activeFilters[colKey] !== undefined;
    return (
      <th className={`p-2 text-center font-bold whitespace-nowrap group relative ${width || ''}`}>
        <div className="flex items-center justify-center gap-1">
          <span>{label}</span>
          <button 
             onClick={(e) => handleFilterClick(e, colKey)}
             className={`p-0.5 rounded transition-colors ${
               isActive ? 'text-blue-600 bg-blue-100' : 'text-gray-300 group-hover:text-gray-500 hover:bg-gray-100'
             }`}
          >
            <Filter size={12} fill={isActive ? "currentColor" : "none"} />
          </button>
        </div>
      </th>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white" onClick={() => setOpenFilterCol(null)}>
      
      {/* 1. Top Toolbar */}
      <div className="border-b border-gray-200 bg-white p-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 sticky top-0 z-20 shadow-sm">
        <div>
           <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
             {isAdmin ? '审核列表' : '申请记录'}
             <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">共 {filteredItems.length} 条</span>
           </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          {bulkStatus && (
            <div className={`text-xs font-mono px-3 py-1.5 rounded border mr-2 animate-fade-in ${
              bulkStatus.includes('失败') || bulkStatus.includes('❌') ? 'bg-red-50 text-red-700 border-red-200' :
              bulkStatus.includes('成功') || bulkStatus.includes('✅') ? 'bg-green-50 text-green-700 border-green-200' :
              'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              {bulkStatus}
            </div>
          )}

          {isAdmin && (
            <button
              onClick={handleBulkVerify}
              disabled={isProcessing || selectedIds.size === 0}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-medium text-white transition-all shadow-sm
                ${selectedIds.size > 0 && !isProcessing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}
              `}
            >
              {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI 批量核对
            </button>
          )}

          {/* Clear Filters Button (Only shows if any filter active) */}
          {Object.keys(activeFilters).length > 0 && (
            <button 
              onClick={clearAllFilters}
              className="flex items-center gap-1 text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded border border-red-200"
            >
              <X size={12} /> 清除筛选
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Table Area */}
      <div className="flex-1 overflow-auto bg-gray-50 p-2 relative">
        <div className="bg-white border border-gray-200 shadow-sm rounded-sm inline-block min-w-full align-middle">
          <table className="min-w-full divide-y divide-gray-300 border-separate border-spacing-0">
            <thead className="bg-gray-100 text-gray-800 text-sm sticky top-0 z-20 shadow-sm">
              <tr>
                {isAdmin && (
                  <th className="sticky left-0 bg-gray-100 p-2 text-center w-10 z-30 border-r border-gray-200">
                    <input type="checkbox" onChange={handleSelectAll} checked={isAllSelected} className="w-4 h-4 rounded border-gray-300 text-blue-600"/>
                  </th>
                )}
                
                <CenterFilterHeader label="年" colKey="year" width="min-w-[60px]" />
                <CenterFilterHeader label="月" colKey="month" width="min-w-[50px]" />
                <CenterFilterHeader label="周" colKey="week" width="min-w-[60px]" />
                
                <FilterHeader label="店铺" colKey="storeName" width="min-w-[140px]" />
                <FilterHeader label="订单号" colKey="orderId" width="min-w-[180px]" />
                <FilterHeader label="报销单号" colKey="autoId" width="min-w-[180px]" />
                <FilterHeader label="报销人" colKey="reimburser" width="min-w-[100px]" />
                
                <FilterHeader label="SKU" colKey="companySKU" width="min-w-[120px]" />
                <FilterHeader label="Model" colKey="model" width="min-w-[120px]" />
                
                <th className="p-2 text-right font-bold min-w-[100px] whitespace-nowrap group">
                   <div className="flex items-center justify-end gap-1">
                     <span>金额 USD</span>
                     <button onClick={(e) => handleFilterClick(e, 'reportAmountUSD')} className={`p-0.5 rounded ${activeFilters['reportAmountUSD'] ? 'text-blue-600' : 'text-gray-300 hover:text-gray-500'}`}><Filter size={12} fill={activeFilters['reportAmountUSD'] ? "currentColor" : "none"}/></button>
                   </div>
                </th>
                <th className="p-2 text-right font-bold min-w-[100px] whitespace-nowrap group">
                   <div className="flex items-center justify-end gap-1">
                     <span>金额 CNY</span>
                     <button onClick={(e) => handleFilterClick(e, 'reimburseAmountCNY')} className={`p-0.5 rounded ${activeFilters['reimburseAmountCNY'] ? 'text-blue-600' : 'text-gray-300 hover:text-gray-500'}`}><Filter size={12} fill={activeFilters['reimburseAmountCNY'] ? "currentColor" : "none"}/></button>
                   </div>
                </th>
                
                <FilterHeader label="付款方式" colKey="paymentMethod" width="min-w-[120px]" />
                <FilterHeader label="买家邮箱" colKey="clientEmail" width="min-w-[180px]" />
                <FilterHeader label="付款属性" colKey="itemReason" width="min-w-[120px]" />
                
                <th className="p-2 text-center font-bold min-w-[80px] whitespace-nowrap bg-blue-50/30">PP转账</th>
                <th className="p-2 text-center font-bold min-w-[80px] whitespace-nowrap bg-blue-50/30">信用卡</th>
                <th className="p-2 text-center font-bold min-w-[80px] whitespace-nowrap bg-blue-50/30">订单图</th>
                <th className="p-2 text-center font-bold min-w-[80px] whitespace-nowrap bg-blue-50/30">聊天图</th>
                
                <FilterHeader label="备注" colKey="note" width="min-w-[200px]" />

                {/* Fixed Columns - OPAQUE BACKGROUNDS */}
                <th 
                  className="sticky z-30 bg-blue-50 p-2 text-center font-bold text-gray-800 shadow-[-5px_0_5px_-5px_rgba(0,0,0,0.1)] border-l border-blue-100 whitespace-nowrap" 
                  style={{ right: `${RIGHT_POS_AI}px`, width: `${COL_WIDTH_AI}px` }}
                >
                  AI 核对结果
                </th>
                <th 
                  className="sticky z-30 bg-gray-100 p-2 text-center font-bold text-gray-800 border-l border-gray-200 whitespace-nowrap group" 
                  style={{ right: `${RIGHT_POS_RESULT}px`, width: `${COL_WIDTH_RESULT}px` }}
                >
                  <div className="flex items-center justify-center gap-1">
                     <span>审核结果</span>
                     <button onClick={(e) => handleFilterClick(e, 'status')} className={`p-0.5 rounded ${activeFilters['status'] ? 'text-blue-600' : 'text-gray-300 hover:text-gray-500'}`}><Filter size={12} fill={activeFilters['status'] ? "currentColor" : "none"}/></button>
                  </div>
                </th>
                <th 
                  className="sticky right-0 z-30 bg-gray-100 p-2 text-center font-bold text-gray-800 border-l border-gray-200 whitespace-nowrap" 
                  style={{ width: `${COL_WIDTH_OPERATION}px` }}
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm">
              {filteredItems.length === 0 ? (
                <tr><td colSpan={23} className="p-10 text-center text-gray-400">暂无数据</td></tr>
              ) : (
                filteredItems.map((item) => {
                  const dateInfo = getDateParts(item.createdAt);
                  const isDangerAttr = item.itemReason === '退款' || item.itemReason === '跑单';
                  const isSelected = selectedIds.has(item.id);

                  return (
                  <tr key={item.id} className={`hover:bg-blue-50 transition-colors group ${isSelected ? 'bg-blue-50' : ''}`}>
                    
                    {isAdmin && (
                       <td className="sticky left-0 bg-white p-2 text-center z-20 border-r border-gray-100 group-hover:bg-blue-50">
                         <input 
                           type="checkbox" 
                           checked={isSelected} 
                           onChange={() => handleSelectRow(item.id)}
                           className="w-4 h-4 rounded border-gray-300 text-blue-600"
                         />
                       </td>
                    )}

                    <td className="p-2 text-center text-gray-600 whitespace-nowrap">{dateInfo.year}</td>
                    <td className="p-2 text-center text-gray-600 whitespace-nowrap">{dateInfo.month}</td>
                    <td className="p-2 text-center text-gray-600 whitespace-nowrap">W{dateInfo.week}</td>

                    <td className="p-2 text-gray-700 whitespace-nowrap" title={item.storeName}>{item.storeName}</td>
                    <td className="p-2 text-blue-600 cursor-text select-all whitespace-nowrap" title={item.orderId}>{item.orderId}</td>
                    <td className="p-2 text-gray-500 text-sm whitespace-nowrap" title={item.autoId}>{item.autoId}</td>
                    <td className="p-2 text-gray-700 font-medium whitespace-nowrap" title={item.reimburser}>{item.reimburser}</td>
                    
                    <td className="p-2 text-gray-700 whitespace-nowrap" title={item.companySKU}>{item.companySKU}</td>
                    <td className="p-2 text-gray-600 whitespace-nowrap" title={item.model}>{item.model}</td>
                    
                    <td className="p-2 text-right font-mono text-green-700 whitespace-nowrap">{item.reportAmountUSD.toFixed(2)}</td>
                    <td className="p-2 text-right font-mono text-gray-600 whitespace-nowrap">{item.reimburseAmountCNY.toFixed(2)}</td>
                    
                    <td className="p-2 text-gray-600 whitespace-nowrap" title={item.paymentMethod}>{item.paymentMethod}</td>
                    <td className="p-2 text-gray-600 whitespace-nowrap" title={item.clientEmail}>{item.clientEmail}</td>
                    <td className={`p-2 whitespace-nowrap ${isDangerAttr ? 'text-red-600 font-bold' : 'text-gray-600'}`} title={item.itemReason}>{item.itemReason}</td>

                    {/* Screenshots */}
                    <td className="p-2 text-center bg-blue-50/10 whitespace-nowrap"><ScreenshotCell url={item.ppTransferScreenshotPrincipal} label="PP" /></td>
                    <td className="p-2 text-center bg-blue-50/10 whitespace-nowrap"><ScreenshotCell url={item.creditCardDeductionScreenshotPrincipal} label="CC" /></td>
                    <td className="p-2 text-center bg-blue-50/10 whitespace-nowrap"><ScreenshotCell url={item.orderIdScreenshot} label="Order" /></td>
                    <td className="p-2 text-center bg-blue-50/10 whitespace-nowrap"><ScreenshotCell url={item.chatScreenshot} label="Chat" /></td>
                    
                    <td className="p-2 text-gray-400 italic whitespace-nowrap" title={item.note}>{item.note || '-'}</td>

                    {/* --- FIXED COLUMNS --- */}
                    
                    {/* 1. AI Audit Result - Solid bg-blue-50, hovers to bg-blue-100 */}
                    <td 
                      className={`sticky z-20 p-2 align-middle shadow-[-5px_0_5px_-5px_rgba(0,0,0,0.1)] border-l border-blue-100 
                        ${isSelected ? 'bg-blue-100' : 'bg-blue-50 group-hover:bg-blue-100'}
                      `}
                      style={{ right: `${RIGHT_POS_AI}px`, width: `${COL_WIDTH_AI}px` }}
                    >
                       <div className="flex items-center justify-center gap-1.5">
                          <CompactAuditResult icon={DollarSign} result={item.auditResult?.usdCheck} onClick={item.ppTransferScreenshotPrincipal ? () => setPreviewImage(item.ppTransferScreenshotPrincipal) : undefined} />
                          <CompactAuditResult icon={CreditCard} result={item.auditResult?.cnyCheck} onClick={item.creditCardDeductionScreenshotPrincipal ? () => setPreviewImage(item.creditCardDeductionScreenshotPrincipal) : undefined} />
                          <CompactAuditResult icon={Hash} result={item.auditResult?.orderCheck} onClick={item.orderIdScreenshot ? () => setPreviewImage(item.orderIdScreenshot) : undefined} />
                          
                          {isAdmin && !item.auditResult && (
                             <button onClick={() => handleVerifySingle(item)} disabled={verifyingId === item.id} className="text-purple-600 hover:bg-purple-100 p-1 rounded transition">
                               {verifyingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                             </button>
                          )}
                       </div>
                    </td>

                    {/* 2. Audit Result (Status) - Solid bg-white, hovers to bg-blue-50 */}
                    <td 
                      className={`sticky z-20 p-2 text-center align-middle border-l border-gray-100 
                        ${isSelected ? 'bg-blue-50' : 'bg-white group-hover:bg-blue-50'}
                      `}
                      style={{ right: `${RIGHT_POS_RESULT}px`, width: `${COL_WIDTH_RESULT}px` }}
                    >
                       <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${
                          item.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
                          item.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                          'bg-yellow-50 text-yellow-700 border-yellow-200'
                       }`}>
                          {item.status === 'approved' ? '已通过' : item.status === 'rejected' ? '已驳回' : '待审核'}
                       </span>
                    </td>

                    {/* 3. Operation - Solid bg-white, hovers to bg-blue-50 */}
                    <td 
                      className={`sticky right-0 z-20 p-2 text-center align-middle border-l border-gray-100 
                        ${isSelected ? 'bg-blue-50' : 'bg-white group-hover:bg-blue-50'}
                      `}
                      style={{ width: `${COL_WIDTH_OPERATION}px` }}
                    >
                       <div className="flex items-center justify-center gap-1">
                          {isAdmin ? (
                            <>
                              <button onClick={() => updateStatus(item, 'approved')} disabled={loadingAction === item.id} className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="通过">
                                <Check size={14} />
                              </button>
                              <button onClick={() => updateStatus(item, 'rejected')} disabled={loadingAction === item.id} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="驳回">
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                             item.status !== 'approved' && (
                                <button onClick={() => onEditItem(item)} className="text-blue-600 hover:underline text-[10px]">
                                   编辑
                                </button>
                             )
                          )}
                       </div>
                    </td>

                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filter Dropdown Portal (Rendered here to avoid clipping) */}
      {openFilterCol && (
        <FilterDropdown colKey={openFilterCol} />
      )}

      {/* Image Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-80 p-4 animate-fade-in" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-5xl max-h-screen bg-white p-1 rounded shadow-2xl">
            <button onClick={() => setPreviewImage(null)} className="absolute -top-10 right-0 text-white hover:text-gray-300">
              <X size={32} />
            </button>
            <img src={previewImage} alt="Preview" className="max-h-[85vh] block mx-auto" />
          </div>
        </div>
      )}

    </div>
  );
};
