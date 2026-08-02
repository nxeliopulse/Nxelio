export type FieldDataType =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "datetime"
  | "email"
  | "phone"
  | "url"
  | "checkbox"
  | "picklist"
  | "multi_picklist"
  | "badge"
  | "avatar"
  | "lookup"
  | "rich_text"
  | "formula"
  | "link";

export interface PicklistOption {
  label: string;
  value: string;
  color?: string;
  variant?: "default" | "blue" | "warning" | "danger" | "success" | "purple" | "info" | "outline" | "pink";
}

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldDataType;
  required?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  options?: PicklistOption[];
  lookupTarget?: string;
  formula?: string;
  description?: string;
}

export interface SectionDefinition {
  id: string;
  title: string;
  description?: string;
  columns?: 1 | 2 | 3 | 4;
  fields: FieldDefinition[];
}

export interface SidebarWidgetConfig {
  id: string;
  type: "related_records" | "tasks" | "notes" | "activity_timeline" | "ai_summary" | "custom";
  title: string;
  props?: Record<string, unknown>;
}

export interface LayoutConfig {
  id: string;
  objectType: string;
  title: string;
  headerFields?: string[];
  sections: SectionDefinition[];
  sidebarWidgets?: SidebarWidgetConfig[];
}

export interface CRMObjectSchema {
  objectType: string;
  singularLabel: string;
  pluralLabel: string;
  iconName: string;
  primaryField: string;
  fields: Record<string, FieldDefinition>;
  defaultLayout: LayoutConfig;
}
