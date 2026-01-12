import React, { useState } from 'react';
import { SettingsState, FormFieldConfig } from '../types';
import { Plus, Trash2, Save, Loader2, Edit2, X, Check, MoreHorizontal } from 'lucide-react';

interface SettingsPanelProps {
  settings: SettingsState;
  onSave: (newSettings: SettingsState) => Promise<void>;
}

// Section Definitions to group fields
const SECTIONS = [
  { id: 'basic', label: '基本信息 (Basic Info)' },
  { id: 'financial', label: '金额信息 (Financials)' },
  { id: 'client', label: '客户与任务 (Client & Task)' },
  { id: 'review', label: '评论详情 (Review Details)' },
  { id: 'evidence', label: '截图证明 (Screenshots)' },
];

const FIELD_TYPES = [
  { value: 'text', label: '文本 (Text)' },
  { value: 'number', label: '数字 (Number)' },
  { value: 'select', label: '下拉框 (Select)' },
  { value: 'file', label: '文件/图片 (File)' },
  { value: 'email', label: '邮箱 (Email)' },
];

// ----------------------------------------------------------------------
// Field Editor Component
// ----------------------------------------------------------------------
interface FieldEditorProps {
  field: FormFieldConfig;
  onUpdate: (updatedField: FormFieldConfig) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}

const FieldEditor: React.FC<FieldEditorProps> = ({ field, onUpdate, onDelete, saving }) => {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelText, setLabelText] = useState(field.label);
  const [newOption, setNewOption] = useState('');

  const toggleRequired = () => {
    onUpdate({ ...field, required: !field.required });
  };

  const saveLabel = () => {
    if (labelText.trim()) {
      onUpdate({ ...field, label: labelText });
      setIsEditingLabel(false);
    }
  };

  const addOption = () => {
    if (newOption.trim()) {
      const currentOptions = field.options || [];
      onUpdate({ ...field, options: [...currentOptions, newOption.trim()] });
      setNewOption('');
    }
  };

  const removeOption = (valToRemove: string) => {
    const currentOptions = field.options || [];
    onUpdate({ ...field, options: currentOptions.filter(o => o !== valToRemove) });
  };

  return (
    <div className={`p-4 rounded-lg border transition-all ${field.required ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-200'}`}>
      
      {/* Header Row: Label + Controls */}
      <div className="flex items-start justify-between gap-2 mb-2">
        
        {/* Label Area */}
        <div className="flex-1">
          {isEditingLabel ? (
            <div className="flex items-center gap-2">
              <input 
                autoFocus
                className="flex-1 p-1 text-sm border border-blue-400 rounded outline-none"
                value={labelText}
                onChange={e => setLabelText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveLabel()}
              />
              <button onClick={saveLabel} className="text-green-600 hover:bg-green-100 p-1 rounded"><Check size={14}/></button>
              <button onClick={() => { setIsEditingLabel(false); setLabelText(field.label); }} className="text-gray-500 hover:bg-gray-100 p-1 rounded"><X size={14}/></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <span className={`text-sm font-bold ${field.required ? 'text-blue-800' : 'text-gray-700'}`}>
                {field.label} {field.required && '*'}
              </span>
              <button 
                onClick={() => setIsEditingLabel(true)} 
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600"
                title="Rename Label"
              >
                <Edit2 size={12} />
              </button>
            </div>
          )}
          <div className="text-[10px] text-gray-400 uppercase font-mono mt-0.5">{field.type} | ID: {field.id}</div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
           <label className="flex items-center gap-1 cursor-pointer select-none text-xs text-gray-600 hover:text-blue-600">
            <input 
              type="checkbox" 
              checked={field.required} 
              onChange={toggleRequired}
              disabled={saving}
              className="w-3 h-3 text-blue-600 rounded focus:ring-blue-500"
            />
            必填
          </label>
          
          <div className="h-4 w-px bg-gray-300 mx-1"></div>

          <button 
            onClick={() => {
              if (field.isSystem) {
                if(!confirm("这是一个系统核心字段，删除可能会影响审核或Excel导出。确定要删除吗？")) return;
              }
              onDelete(field.id);
            }}
            disabled={saving}
            className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
            title="Delete Field"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Body: Option Manager for Selects */}
      {field.type === 'select' && (
        <div className="mt-2 bg-gray-50/50 rounded p-2 border border-gray-100 border-dashed">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {field.options && field.options.length > 0 ? field.options.map(opt => (
               <span key={opt} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white border border-gray-200 text-gray-600 shadow-sm">
                  {opt}
                  <button onClick={() => removeOption(opt)} disabled={saving} className="ml-1 hover:text-red-500">
                    <X size={10} />
                  </button>
               </span>
            )) : <span className="text-[10px] text-gray-400 italic">暂无选项 (No Options)</span>}
          </div>
          <div className="flex gap-1">
             <input 
                type="text" 
                value={newOption}
                onChange={e => setNewOption(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addOption()}
                placeholder="新增选项..."
                className="flex-1 text-[10px] p-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
              />
              <button 
                onClick={addOption}
                disabled={!newOption.trim() || saving}
                className="bg-blue-600 text-white px-2 rounded hover:bg-blue-700 flex items-center justify-center"
              >
                <Plus size={12} />
              </button>
          </div>
        </div>
      )}

      {/* Body: Placeholder for other types */}
      {field.type !== 'select' && (
        <div className="mt-2 text-[10px] text-gray-300 italic bg-gray-50 rounded p-1.5 text-center border border-dashed border-gray-200">
           {field.type === 'file' ? 'File Upload Area' : 'Text Input Area'}
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// Main Settings Panel
// ----------------------------------------------------------------------

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onSave }) => {
  const [formConfig, setFormConfig] = useState<FormFieldConfig[]>(settings.formConfig || []);
  const [saving, setSaving] = useState(false);
  
  // New Field State
  const [addingToSection, setAddingToSection] = useState<string | null>(null);
  const [newFieldData, setNewFieldData] = useState({ label: '', type: 'text' });

  const hasChanges = JSON.stringify(formConfig) !== JSON.stringify(settings.formConfig);

  const handleUpdateField = (updatedField: FormFieldConfig) => {
    setFormConfig(prev => prev.map(f => f.id === updatedField.id ? updatedField : f));
  };

  const handleDeleteField = (id: string) => {
    setFormConfig(prev => prev.filter(f => f.id !== id));
  };

  const handleAddField = () => {
    if (!addingToSection || !newFieldData.label) return;

    const id = `custom_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const newField: FormFieldConfig = {
      id,
      label: newFieldData.label,
      type: newFieldData.type as any,
      section: addingToSection as any,
      required: false,
      isSystem: false,
      options: newFieldData.type === 'select' ? ['Option A', 'Option B'] : undefined
    };

    setFormConfig(prev => [...prev, newField]);
    setAddingToSection(null);
    setNewFieldData({ label: '', type: 'text' });
  };

  const handleSave = async () => {
    setSaving(true);
    // Preserve other settings, just update formConfig
    await onSave({ ...settings, formConfig });
    setSaving(false);
  };

  return (
    <div className="max-w-6xl mx-auto pb-10">
      
      {/* Top Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-40">
        <div>
           <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
             <Edit2 className="text-blue-600" size={24} />
             表单构建器 (Form Builder)
           </h2>
           <p className="text-xs text-gray-500 mt-1">
             完全自定义报销申请单。您可以新增字段、修改标题、管理下拉选项或删除不需要的字段。
           </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all shadow-md ${
            hasChanges 
              ? 'bg-blue-600 text-white hover:bg-blue-700 transform hover:scale-105' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {hasChanges ? '保存所有更改 (Save Changes)' : '已保存 (Saved)'}
        </button>
      </div>

      <div className="space-y-8">
        {SECTIONS.map((section) => {
          const sectionFields = formConfig.filter(f => f.section === section.id);

          return (
            <div key={section.id} className="bg-gray-50 p-5 rounded-xl border border-gray-100 relative shadow-sm">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-800">{section.label}</h3>
                
                {/* Add Field Button */}
                <button 
                  onClick={() => setAddingToSection(section.id)}
                  className="text-xs bg-white border border-blue-200 text-blue-700 px-3 py-1.5 rounded-full font-semibold hover:bg-blue-50 flex items-center gap-1 transition shadow-sm"
                >
                  <Plus size={14} />
                  新增字段 (Add Field)
                </button>
              </div>

              {/* Add Field Inline Form */}
              {addingToSection === section.id && (
                <div className="mb-4 bg-blue-50 p-4 rounded-lg border border-blue-200 animate-fade-in flex flex-col md:flex-row gap-3 items-end">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-blue-800 mb-1">字段名称 (Label)</label>
                    <input 
                      autoFocus
                      className="w-full p-2 text-sm border border-blue-300 rounded"
                      placeholder="例如: 司机姓名"
                      value={newFieldData.label}
                      onChange={e => setNewFieldData({...newFieldData, label: e.target.value})}
                    />
                  </div>
                  <div className="w-full md:w-48">
                     <label className="block text-xs font-bold text-blue-800 mb-1">字段类型 (Type)</label>
                     <select 
                      className="w-full p-2 text-sm border border-blue-300 rounded bg-white"
                      value={newFieldData.type}
                      onChange={e => setNewFieldData({...newFieldData, type: e.target.value})}
                     >
                       {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                     </select>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                    <button 
                      onClick={handleAddField}
                      disabled={!newFieldData.label.trim()}
                      className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                      确认添加
                    </button>
                    <button 
                      onClick={() => setAddingToSection(null)}
                      className="flex-1 md:flex-none bg-white text-gray-600 border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* Grid of Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sectionFields.length === 0 && (
                  <div className="col-span-full py-8 text-center text-gray-400 italic bg-white rounded border border-dashed">
                    此区域暂无字段 (No fields in this section)
                  </div>
                )}
                {sectionFields.map(field => (
                  <FieldEditor 
                    key={field.id}
                    field={field}
                    onUpdate={handleUpdateField}
                    onDelete={handleDeleteField}
                    saving={saving}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};