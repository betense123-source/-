
import React, { useState, ChangeEvent, useEffect } from 'react';
import { SettingsState, ReimbursementItem, User, FormFieldConfig } from '../types';
import { Upload, X, CheckCircle, Save, Loader2, ArrowLeft, FileText, Info } from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';
import { generateReimbursementId } from '../services/storageService';

interface ReimbursementFormProps {
  settings: SettingsState;
  currentUser: User;
  items?: ReimbursementItem[]; // Needed for sequence calculation
  onSubmit: (item: ReimbursementItem) => Promise<void>;
  onBulkSubmit: (items: ReimbursementItem[]) => Promise<void>;
  initialData?: ReimbursementItem | null; // For editing
  onUpdate?: (item: ReimbursementItem) => Promise<void>; // For editing submit
  onCancelEdit?: () => void;
  onNotification: (message: string, type: 'error' | 'success') => void;
}

const SECTION_LABELS: Record<string, string> = {
  basic: '基本信息 / Basic Info',
  financial: '金额信息 / Financials',
  client: '客户与任务 / Client & Task',
  review: '评论详情 / Review Details',
  evidence: '截图证明 / Screenshots'
};

// --- Helper Components ---

const CompactFileUpload = ({ 
  label, 
  value, 
  onChange, 
  onRemove,
  required
}: { 
  label: string; 
  value: string | null; 
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  required: boolean;
}) => (
  <div className="col-span-1 flex flex-col h-full min-w-0">
    <label className="block text-[10px] font-bold text-gray-500 mb-1 truncate" title={label}>
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className={`w-full aspect-square md:aspect-video border border-dashed rounded-sm relative hover:bg-blue-50 transition-colors flex flex-col items-center justify-center ${required && !value ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'}`}>
      {!value ? (
        <>
          <Upload className="w-4 h-4 text-gray-400 mb-1" />
          <span className="text-[9px] text-gray-400 text-center px-1 leading-tight">点击上传</span>
          <input
            type="file"
            accept="image/*"
            onChange={onChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </>
      ) : (
        <div className="relative w-full h-full group overflow-hidden flex items-center justify-center bg-gray-50">
          <img src={value} alt="Preview" className="max-w-full max-h-full object-contain" />
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-1 right-1 bg-white rounded-full p-1 shadow-md text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  </div>
);

export const ReimbursementForm: React.FC<ReimbursementFormProps> = ({ 
  settings, 
  currentUser,
  items = [],
  onSubmit, 
  onBulkSubmit,
  initialData,
  onUpdate,
  onCancelEdit,
  onNotification
}) => {
  const [formData, setFormData] = useState<Partial<ReimbursementItem>>({
    reimburser: currentUser.username,
    customFields: {}
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>(initialData ? 'single' : 'single');

  const formConfig = settings.formConfig || [];

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      setActiveTab('single');
    } else {
       setFormData({
        reimburser: currentUser.username,
        customFields: {}
      });
    }
  }, [initialData, currentUser.username]);

  // Unified Handler
  const handleChange = (field: FormFieldConfig, value: any) => {
    if (field.systemKey) {
      setFormData(prev => ({ ...prev, [field.systemKey!]: value }));
    } else {
      setFormData(prev => ({ 
        ...prev, 
        customFields: { ...prev.customFields, [field.id]: value } 
      }));
    }
  };

  const handleFileChange = (field: FormFieldConfig) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024 * 5) {
        onNotification("文件过大 (Max 5MB)", 'error');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        handleChange(field, reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getValue = (field: FormFieldConfig) => {
    if (field.systemKey) {
      return (formData as any)[field.systemKey];
    }
    return formData.customFields?.[field.id];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const missingFields: string[] = [];
    formConfig.forEach(field => {
      if (field.required) {
        const val = getValue(field);
        if (val === null || val === undefined || val === '') {
          missingFields.push(field.label);
        }
      }
    });

    if (missingFields.length > 0) {
      onNotification(`以下必填项未填写 (Missing required fields):\n${missingFields.join(', ')}`, 'error');
      return;
    }
    
    // --- DUPLICATE CHECK START ---
    const normalize = (str: any) => String(str || '').trim();
    const currentOrderId = normalize(formData.orderId);
    const currentReason = normalize(formData.itemReason);

    // Only check if both values exist
    if (currentOrderId && currentReason) {
      const duplicate = items.find(i => 
        i.id !== (initialData?.id || '') && // Exclude self if editing
        normalize(i.orderId) === currentOrderId &&
        normalize(i.itemReason) === currentReason
      );

      if (duplicate) {
         onNotification(`⛔️ 提交被阻止 (Submission Blocked)\n\n检测到重复数据：\n订单号: ${currentOrderId}\n付款属性: ${currentReason}\n\n该订单已包含此付款属性的记录。同一订单号下，每一类付款属性（如本金、佣金等）只能有一条记录。`, 'error');
         return;
      }
    }
    // --- DUPLICATE CHECK END ---

    setLoading(true);

    try {
      const commonData = {
         ...formData,
         orderAmount: Number(formData.orderAmount || 0),
         commission: Number(formData.commission || 0),
         reportAmountUSD: Number(formData.reportAmountUSD || 0),
         reimburseAmountCNY: Number(formData.reimburseAmountCNY || 0),
         exchangeRate: Number(formData.exchangeRate || 0),
      };

      if (initialData && onUpdate) {
        const updatedItem: ReimbursementItem = {
           ...initialData,
           ...commonData as ReimbursementItem,
           status: 'pending', 
        };
        await onUpdate(updatedItem);
        // Success handled by parent notification
      } else {
        // GENERATE ID using new logic (Initials + Date + Sequence)
        const autoId = generateReimbursementId(currentUser, items);

        const newItem: ReimbursementItem = {
          ...commonData as ReimbursementItem,
          id: crypto.randomUUID(),
          userId: currentUser.id,
          userName: currentUser.username,
          autoId: autoId,
          status: 'pending',
          createdAt: Date.now(),
        };
        await onSubmit(newItem);
        
        setFormData({
          reimburser: currentUser.username,
          customFields: {}
        });
      }

      // Cleanup happens in parent or after timeout
      if (initialData && onCancelEdit) onCancelEdit();
      
    } catch (e) {
      console.error(e);
      onNotification("System Error", 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderFieldInput = (field: FormFieldConfig) => {
    const val = getValue(field) || '';
    const baseClasses = "w-full text-xs px-2 py-1.5 border rounded-sm outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors";
    
    if (field.type === 'select') {
      return (
        <SearchableSelect
          value={val}
          options={field.options || []}
          onChange={(newVal) => handleChange(field, newVal)}
          placeholder={`选择或输入 ${field.label}`}
        />
      );
    }

    if (field.type === 'file') {
      return (
        <CompactFileUpload 
          label={field.label}
          required={field.required}
          value={val}
          onChange={handleFileChange(field)}
          onRemove={() => handleChange(field, null)}
        />
      );
    }

    return (
      <input 
        type={field.type} 
        step={field.type === 'number' ? '0.0001' : undefined}
        required={field.required}
        readOnly={field.id === 'reimburser'}
        placeholder={field.label}
        className={`${baseClasses} ${field.id === 'reimburser' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white border-gray-300'}`}
        value={val} 
        onChange={e => handleChange(field, e.target.value)} 
      />
    );
  };

  // Section rendering logic
  const renderSection = (sectionKey: string, cols: number = 4) => {
    const sectionFields = formConfig.filter(f => f.section === sectionKey);
    if (sectionFields.length === 0) return null;

    // Separate files from regular inputs to render them nicely at the end or in a grid
    const fileFields = sectionFields.filter(f => f.type === 'file');
    const inputFields = sectionFields.filter(f => f.type !== 'file');

    return (
      <div key={sectionKey} className="border border-gray-200 bg-white rounded-sm shadow-sm overflow-hidden mb-4 last:mb-0">
        <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5 flex items-center gap-2">
           <div className="w-1 h-3 bg-blue-500 rounded-full"></div>
           <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
             {SECTION_LABELS[sectionKey] || sectionKey}
           </h3>
        </div>
        
        <div className="p-4">
           {/* Regular Inputs Grid */}
           {inputFields.length > 0 && (
             <div className={`grid grid-cols-2 md:grid-cols-${cols} xl:grid-cols-${cols+1} gap-4 mb-4`}>
               {inputFields.map(field => (
                 <div key={field.id} className="min-w-0">
                    <label className="block text-[10px] font-bold text-gray-500 mb-1 truncate" title={field.label}>
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                    {renderFieldInput(field)}
                 </div>
               ))}
             </div>
           )}

           {/* Files Grid (if any) */}
           {fileFields.length > 0 && (
             <>
               {inputFields.length > 0 && <div className="border-t border-dashed border-gray-200 my-3"></div>}
               <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                 {fileFields.map(field => renderFieldInput(field))}
               </div>
             </>
           )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full mx-auto pb-10 animate-fade-in">
      
      {/* Top Toolbar */}
      <div className="bg-white border border-gray-200 rounded-sm shadow-sm p-3 mb-4 flex flex-col md:flex-row justify-between items-center gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-2">
           {initialData && (
             <button onClick={onCancelEdit} className="p-1.5 hover:bg-gray-100 rounded text-gray-500">
               <ArrowLeft size={16} />
             </button>
           )}
           <div className="flex flex-col">
             <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
               <FileText size={16} className="text-blue-600" />
               {initialData ? '编辑单据 (Edit)' : '新建申请单 (New Application)'}
             </h2>
             {initialData && <span className="text-[10px] text-gray-400 font-mono">ID: {initialData.autoId}</span>}
           </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          
          {initialData && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="px-4 py-1.5 rounded-sm border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-50 transition"
            >
              取消
            </button>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 md:flex-none flex items-center justify-center gap-1 px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-sm shadow-sm transition disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {initialData ? '保存修改 (Save)' : '提交申请 (Submit)'}
          </button>
        </div>
      </div>

      {activeTab === 'bulk' ? (
         <div className="bg-white p-12 text-center border border-dashed border-gray-300 rounded text-gray-400 text-sm">
           Coming Soon
         </div>
      ) : (
        <form className="space-y-4">
          {/* Section 1: Basic Info (High Density) */}
          {renderSection('basic', 5)}
          
          {/* Section 2: Financials (High Density) */}
          {renderSection('financial', 5)}
          
          {/* Section 3: Client (Medium Density) */}
          {renderSection('client', 4)}
          
          {/* Section 4: Review (Medium Density) */}
          {renderSection('review', 4)}
          
          {/* Section 5: Evidence (File Heavy) */}
          {renderSection('evidence', 4)}
        </form>
      )}
    </div>
  );
};
