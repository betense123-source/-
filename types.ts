
export enum AppView {
  LOGIN = 'login',
  REIMBURSEMENT = 'reimbursement',
  AUDIT = 'audit',
  SETTINGS = 'settings',
  USER_MANAGEMENT = 'user_management',
}

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  password: string; // In a real app, this should be hashed
  chineseName: string; // NEW: Mandatory Chinese Name
  role: UserRole;
  createdAt: number;
}

// Configuration for a single form field
export interface FormFieldConfig {
  id: string;          // Unique ID
  label: string;       // Display Label
  type: 'text' | 'number' | 'select' | 'email' | 'file';
  section: 'basic' | 'financial' | 'client' | 'review' | 'evidence';
  required: boolean;
  options?: string[];  // For select types
  systemKey?: keyof ReimbursementItem; // If maps to a core hardcoded field
  isSystem?: boolean;  // If true, type cannot be changed, id cannot be changed
}

export interface SettingsState {
  // We keep these for backward compatibility or if specific logic needs them, 
  // but main driver will be formConfig
  storeNames: string[];
  projectNames: string[];
  companySKUs: string[];
  models: string[];
  currencies: string[];
  paymentMethods: string[];
  items: string[];
  sources: string[];
  transferCommissions: string[];
  reviewDropped: string[];
  communicationChannels: string[];
  paymentCardDigits: string[];
  requiredFields: string[]; 
  
  // NEW: The master configuration for the form
  formConfig: FormFieldConfig[];
}

export interface SingleCheckResult {
  verified: boolean;
  extractedAmount: number | null; // Used for amounts
  extractedText?: string | null;  // Used for text/order ID
  reason: string;
}

export interface AuditResult {
  usdCheck: SingleCheckResult;
  cnyCheck: SingleCheckResult;
  orderCheck: SingleCheckResult; // NEW: Order ID verification result
  timestamp: number;
}

export interface ReimbursementItem {
  id: string; // Internal UUID
  userId: string; // Owner ID
  userName?: string; // Owner Name (snapshot)
  
  autoId: string; // Row 1: System Generated
  reimburser: string; // Row 2: Required
  projectName: string; // Row 3: Required, Dropdown (New)
  storeName: string; // Row 4: Required, Dropdown
  companySKU: string; // Row 5: Required, Dropdown
  model: string; // Row 6: Required, Dropdown
  orderId: string; // Row 7
  orderAmount: number; // Row 8
  commission: number; // Row 9
  currency: string; // Row 10: Required, Dropdown
  paymentMethod: string; // Row 11: Required, Dropdown
  reportAmountUSD: number; // Row 12: Required (Main for Audit)
  reimburseAmountCNY: number; // Row 13
  clientPPAccount: string; // Row 14: Required
  clientEmail: string; // Row 15: Required
  itemReason: string; // Row 16: Dropdown
  source: string; // Row 17: Required, Dropdown
  note: string; // Row 18
  exchangeRate: number; // Row 19
  reviewID: string; // Row 20
  reviewScreenshot: string | null; // Row 21: File
  isTransferCommission: string; // Row 22: Dropdown
  isReviewDropped: string; // Row 23: Dropdown
  communicationChannel: string; // Row 24: Dropdown
  paymentCardLastDigits: string; // Row 25: Dropdown
  
  // Screenshots
  ppTransferScreenshotPrincipal: string | null; // Audit Target 1
  creditCardDeductionScreenshotPrincipal: string | null; // Audit Target 2
  ppTransferScreenshotCommission: string | null; 
  creditCardDeductionScreenshotCommission: string | null; 
  ppDeductionScreenshotTax: string | null; 
  orderIdScreenshot: string | null; // NEW: Specific screenshot for Order ID
  chatScreenshot: string | null; // NEW: Chat content screenshot
  
  reviewLink: string; 
  clientProfile: string; 
  
  // NEW: Store dynamic fields here
  customFields?: Record<string, any>;

  status: 'pending' | 'approved' | 'rejected';
  auditResult?: AuditResult;
  createdAt: number;
}
