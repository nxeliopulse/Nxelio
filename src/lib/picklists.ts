// Shared picklist constants + types. Kept out of the "use server" query
// module because a "use server" file may only export async functions.

export const PICKLIST_KEYS = [
  "lead_industry",
  "lead_interest_area",
  "lead_status",
  "lead_company_size",
  "lead_seniority",
] as const;
export type PicklistKey = (typeof PICKLIST_KEYS)[number];

// Kept in sync with the seed values in migration 0086_picklist_manager.sql —
// used only as a defensive fallback if a workspace's picklist rows are ever
// missing/unreachable, so a dropdown never silently renders empty.
export const PICKLIST_FALLBACK_VALUES: Record<PicklistKey, string[]> = {
  lead_industry: ["Technology", "Consulting", "Enterprise Software", "Analytics", "Retail", "Cloud Services", "Manufacturing", "Training", "Healthcare", "Finance"],
  lead_interest_area: ["CRM Automation", "SAP AI", "Digital Transformation", "AI Platforms", "Customer Engagement", "Workflow Automation", "AI Personalization", "Lead Nurturing", "Lead Scoring"],
  lead_status: ["New", "Contacted", "Qualified", "Nurturing", "Converted"],
  lead_company_size: ["1-10", "11-50", "51-200", "201-1000", "1000+"],
  lead_seniority: ["C-Level", "VP", "Director", "Manager", "Individual Contributor"],
};

export interface PicklistValueRow {
  id: string;
  category_id: string;
  value: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
}

export interface PicklistCategoryRow {
  id: string;
  key: PicklistKey;
  label: string;
  values: PicklistValueRow[];
}
