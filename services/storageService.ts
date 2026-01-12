/**
 * 数据存储服务 - Supabase 版本
 * 处理系统设置、报销申请的增删改查
 */

import { ReimbursementItem, SettingsState, User, FormFieldConfig } from '../types';
import { supabase } from './supabaseClient';
import { pinyin } from 'pinyin-pro';

// --- 初始化配置 ---

/** 初始选项配置（用于首次初始化） */
const INIT_OPTS = {
  storeNames: ['Anilivo-US', 'Anilivo-UK', 'Store C'],
  projectNames: ['Project A', 'Project B'],
  companySKUs: ['SKU-001', 'SKU-002', '66-6609-01'],
  models: ['Wireless Microphone', 'Lavalier Mic'],
  currencies: ['USD', 'EUR', 'GBP'],
  paymentMethods: ['PayPal', 'Credit Card'],
  items: ['本金', '佣金', '差额', '退款', '跑单'],
  sources: ['Facebook', 'Instagram', 'Email'],
  transferCommissions: ['Yes', 'No'],
  reviewDropped: ['No', 'Yes'],
  communicationChannels: ['WhatsApp', 'Messenger', 'WeChat'],
  paymentCardDigits: ['1234', '5678'],
};

/** 默认表单字段配置 */
const DEFAULT_FORM_CONFIG: FormFieldConfig[] = [
  // --- Section 1: Basic Info ---
  { id: 'storeName', label: '店铺 (Store)', type: 'select', section: 'basic', required: true, options: INIT_OPTS.storeNames, isSystem: true, systemKey: 'storeName' },
  { id: 'orderId', label: '订单号 (Order ID)', type: 'text', section: 'basic', required: true, isSystem: true, systemKey: 'orderId' },
  { id: 'companySKU', label: 'SKU', type: 'select', section: 'basic', required: true, options: INIT_OPTS.companySKUs, isSystem: true, systemKey: 'companySKU' },
  { id: 'model', label: 'Model', type: 'select', section: 'basic', required: false, options: INIT_OPTS.models, isSystem: true, systemKey: 'model' },

  // --- Section 2: Financials ---
  { id: 'reportAmountUSD', label: '金额 USD', type: 'number', section: 'financial', required: true, isSystem: true, systemKey: 'reportAmountUSD' },
  { id: 'reimburseAmountCNY', label: '金额 CNY', type: 'number', section: 'financial', required: true, isSystem: true, systemKey: 'reimburseAmountCNY' },
  { id: 'paymentMethod', label: '付款方式 (Payment Method)', type: 'select', section: 'financial', required: true, options: INIT_OPTS.paymentMethods, isSystem: true, systemKey: 'paymentMethod' },
  { id: 'itemReason', label: '付款属性 (Attribute)', type: 'select', section: 'financial', required: false, options: INIT_OPTS.items, isSystem: true, systemKey: 'itemReason' },

  // --- Section 3: Client Info ---
  { id: 'clientEmail', label: '买家邮箱 (Email)', type: 'email', section: 'client', required: false, isSystem: true, systemKey: 'clientEmail' },
  { id: 'note', label: '备注 (Note)', type: 'text', section: 'client', required: false, isSystem: true, systemKey: 'note' },

  // --- Section 4: Screenshots ---
  { id: 'ppTransferScreenshotPrincipal', label: 'PP转帐截图', type: 'file', section: 'evidence', required: true, isSystem: true, systemKey: 'ppTransferScreenshotPrincipal' },
  { id: 'creditCardDeductionScreenshotPrincipal', label: '信用卡截图', type: 'file', section: 'evidence', required: true, isSystem: true, systemKey: 'creditCardDeductionScreenshotPrincipal' },
  { id: 'orderIdScreenshot', label: '订单号截图', type: 'file', section: 'evidence', required: true, isSystem: true, systemKey: 'orderIdScreenshot' },
  { id: 'chatScreenshot', label: '聊天内容截图', type: 'file', section: 'evidence', required: false, isSystem: true, systemKey: 'chatScreenshot' },

  // Hidden but system fields
  { id: 'reimburser', label: '报销人', type: 'text', section: 'basic', required: true, isSystem: true, systemKey: 'reimburser' },
];

/** 默认设置 */
const DEFAULT_SETTINGS: SettingsState = {
  ...INIT_OPTS,
  requiredFields: [],
  formConfig: DEFAULT_FORM_CONFIG,
};

// --- 设置相关函数 ---

/**
 * 获取系统设置
 */
export const getSettings = async (): Promise<SettingsState> => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();

    if (error || !data) {
      console.log('使用默认设置');
      return DEFAULT_SETTINGS;
    }

    const parsed = data.data as SettingsState;

    // 迁移/回退：如果 formConfig 不存在，使用默认值
    if (!parsed.formConfig || parsed.formConfig.length === 0) {
      return { ...DEFAULT_SETTINGS, ...parsed, formConfig: DEFAULT_FORM_CONFIG };
    }

    // 确保 items 选项是最新的
    return { ...DEFAULT_SETTINGS, ...parsed, items: INIT_OPTS.items };
  } catch (e) {
    console.error('获取设置异常:', e);
    return DEFAULT_SETTINGS;
  }
};

/**
 * 保存系统设置
 */
export const saveSettings = async (settings: SettingsState): Promise<void> => {
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({ id: 'global', data: settings });

    if (error) {
      console.error('保存设置失败:', error.message);
      throw new Error(error.message);
    }
  } catch (e: any) {
    console.error('保存设置异常:', e);
    throw e;
  }
};

// --- 报销申请相关函数 ---

/**
 * 获取报销申请列表
 * 管理员可查看所有申请，普通用户只能查看自己的
 */
export const getReimbursements = async (currentUser: User): Promise<ReimbursementItem[]> => {
  try {
    let query = supabase
      .from('reimbursements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    // 非管理员只能查看自己的申请
    if (currentUser.role !== 'admin') {
      query = query.eq('user_id', currentUser.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('获取报销列表失败:', error.message);
      return [];
    }

    // 从 JSONB data 字段解析完整记录
    return (data || []).map((row: any) => ({
      ...row.data,
      id: row.id,
    })) as ReimbursementItem[];
  } catch (e) {
    console.error('获取报销列表异常:', e);
    return [];
  }
};

/**
 * 保存单条报销申请
 */
export const saveReimbursement = async (item: ReimbursementItem): Promise<void> => {
  try {
    const { error } = await supabase.from('reimbursements').insert({
      id: item.id,
      user_id: item.userId,
      data: item,
      created_at: item.createdAt,
    });

    if (error) {
      console.error('保存报销申请失败:', error.message);
      throw new Error(error.message);
    }
  } catch (e: any) {
    console.error('保存报销申请异常:', e);
    throw e;
  }
};

/**
 * 批量保存报销申请
 */
export const saveReimbursementsBulk = async (newItems: ReimbursementItem[]): Promise<void> => {
  if (newItems.length === 0) return;

  try {
    const records = newItems.map((item) => ({
      id: item.id,
      user_id: item.userId,
      data: item,
      created_at: item.createdAt,
    }));

    const { error } = await supabase.from('reimbursements').insert(records);

    if (error) {
      console.error('批量保存失败:', error.message);
      throw new Error(error.message);
    }
  } catch (e: any) {
    console.error('批量保存异常:', e);
    throw e;
  }
};

/**
 * 更新报销申请
 */
export const updateReimbursement = async (updatedItem: ReimbursementItem): Promise<void> => {
  try {
    const { error } = await supabase
      .from('reimbursements')
      .update({
        data: updatedItem,
        created_at: updatedItem.createdAt,
      })
      .eq('id', updatedItem.id);

    if (error) {
      console.error('更新报销申请失败:', error.message);
      throw new Error(error.message);
    }
  } catch (e: any) {
    console.error('更新报销申请异常:', e);
    throw e;
  }
};

// --- ID 生成函数 ---

/**
 * 生成报销申请唯一 ID
 * 格式: [中文姓名首字母][YYYYMMDD][###]
 */
export const generateReimbursementId = (user: User, allItems: ReimbursementItem[]): string => {
  // 1. 获取姓名首字母
  let initials = user.username.toUpperCase().slice(0, 5);

  if (user.chineseName) {
    try {
      const p = pinyin(user.chineseName, { pattern: 'first', toneType: 'none', type: 'array' });
      if (Array.isArray(p)) {
        initials = p.join('').toUpperCase();
      }
    } catch (e) {
      console.warn('拼音转换失败，使用用户名作为回退', e);
    }
  }

  // 2. 获取日期字符串 (YYYYMMDD)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const prefix = `${initials}${dateStr}`;

  // 3. 计算序号
  const todayUserItems = allItems.filter(
    (i) => i.autoId && i.autoId.startsWith(prefix)
  );

  const sequence = String(todayUserItems.length + 1).padStart(3, '0');

  return `${prefix}${sequence}`;
};
