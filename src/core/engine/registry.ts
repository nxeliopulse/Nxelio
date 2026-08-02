import type { CRMObjectSchema } from "./types";

export const LeadSchema: CRMObjectSchema = {
  objectType: "lead",
  singularLabel: "Lead",
  pluralLabel: "Leads",
  iconName: "User",
  primaryField: "full_name",
  fields: {
    full_name: { name: "full_name", label: "Full Name", type: "text", required: true },
    email: { name: "email", label: "Email Address", type: "email" },
    phone: { name: "phone", label: "Phone Number", type: "phone" },
    company_name: { name: "company_name", label: "Company", type: "text" },
    job_title: { name: "job_title", label: "Job Title", type: "text" },
    status: {
      name: "status",
      label: "Status",
      type: "picklist",
      options: [
        { label: "New", value: "New", variant: "blue" },
        { label: "Contacted", value: "Contacted", variant: "purple" },
        { label: "Qualified", value: "Qualified", variant: "success" },
        { label: "Nurturing", value: "Nurturing", variant: "warning" },
        { label: "Converted", value: "Converted", variant: "success" },
      ],
    },
    estimated_value: { name: "estimated_value", label: "Deal Value", type: "currency" },
    source: { name: "source", label: "Lead Source", type: "text" },
    created_at: { name: "created_at", label: "Created Date", type: "date", readOnly: true },
  },
  defaultLayout: {
    id: "default_lead_layout",
    objectType: "lead",
    title: "Lead Details",
    headerFields: ["company_name", "job_title", "status"],
    sections: [
      {
        id: "contact_info",
        title: "Contact Information",
        columns: 2,
        fields: [
          { name: "full_name", label: "Full Name", type: "text", required: true },
          { name: "email", label: "Email Address", type: "email" },
          { name: "phone", label: "Phone Number", type: "phone" },
          { name: "job_title", label: "Job Title", type: "text" },
        ],
      },
      {
        id: "company_info",
        title: "Company & Deal Details",
        columns: 2,
        fields: [
          { name: "company_name", label: "Company", type: "text" },
          { name: "estimated_value", label: "Estimated Value", type: "currency" },
          { name: "status", label: "Lead Status", type: "picklist" },
          { name: "source", label: "Source", type: "text" },
        ],
      },
    ],
  },
};

export const AccountSchema: CRMObjectSchema = {
  objectType: "account",
  singularLabel: "Account",
  pluralLabel: "Accounts",
  iconName: "Building2",
  primaryField: "account_name",
  fields: {
    account_name: { name: "account_name", label: "Account Name", type: "text", required: true },
    website: { name: "website", label: "Website", type: "url" },
    industry: { name: "industry", label: "Industry", type: "text" },
    employees: { name: "employees", label: "Employees", type: "number" },
    annual_revenue: { name: "annual_revenue", label: "Annual Revenue", type: "currency" },
    phone: { name: "phone", label: "Phone", type: "phone" },
    account_type: { name: "account_type", label: "Account Type", type: "text" },
    rating: {
      name: "rating",
      label: "Rating",
      type: "picklist",
      options: [
        { label: "Hot", value: "Hot", variant: "danger" },
        { label: "Warm", value: "Warm", variant: "warning" },
        { label: "Cold", value: "Cold", variant: "blue" },
      ],
    },
  },
  defaultLayout: {
    id: "default_account_layout",
    objectType: "account",
    title: "About",
    sections: [
      {
        id: "account_info",
        title: "About",
        columns: 2,
        fields: [
          { name: "phone", label: "Phone", type: "phone" },
          { name: "website", label: "Website", type: "url" },
          { name: "industry", label: "Industry", type: "text" },
          { name: "account_type", label: "Account type", type: "text" },
          { name: "employees", label: "Employees", type: "number" },
          { name: "annual_revenue", label: "Annual revenue", type: "currency" },
          { name: "rating", label: "Rating", type: "picklist" },
        ],
      },
    ],
  },
};

export const ContactSchema: CRMObjectSchema = {
  objectType: "contact",
  singularLabel: "Contact",
  pluralLabel: "Contacts",
  iconName: "UserCheck",
  primaryField: "first_name",
  fields: {
    first_name: { name: "first_name", label: "First Name", type: "text", required: true },
    last_name: { name: "last_name", label: "Last Name", type: "text", required: true },
    email: { name: "email", label: "Email", type: "email" },
    phone: { name: "phone", label: "Phone", type: "phone" },
    mobile: { name: "mobile", label: "Mobile", type: "phone" },
    job_title: { name: "job_title", label: "Job Title", type: "text" },
    department: { name: "department", label: "Department", type: "text" },
    lead_source: { name: "lead_source", label: "Lead Source", type: "text" },
  },
  defaultLayout: {
    id: "default_contact_layout",
    objectType: "contact",
    title: "About",
    sections: [
      {
        id: "contact_about",
        title: "About",
        columns: 2,
        fields: [
          { name: "email", label: "Email", type: "email" },
          { name: "phone", label: "Phone", type: "phone" },
          { name: "mobile", label: "Mobile", type: "phone" },
          { name: "job_title", label: "Job title", type: "text" },
          { name: "department", label: "Department", type: "text" },
          { name: "lead_source", label: "Lead source", type: "text" },
        ],
      },
    ],
  },
};

export const OpportunitySchema: CRMObjectSchema = {
  objectType: "opportunity",
  singularLabel: "Opportunity",
  pluralLabel: "Opportunities",
  iconName: "Briefcase",
  primaryField: "name",
  fields: {
    name: { name: "name", label: "Opportunity Name", type: "text", required: true },
    amount: { name: "amount", label: "Amount", type: "currency" },
    stage: {
      name: "stage",
      label: "Stage",
      type: "picklist",
      options: [
        { label: "Qualification", value: "Qualification", variant: "blue" },
        { label: "Needs Analysis", value: "Needs Analysis", variant: "purple" },
        { label: "Proposal", value: "Proposal", variant: "warning" },
        { label: "Negotiation", value: "Negotiation", variant: "info" },
        { label: "Closed Won", value: "Closed Won", variant: "success" },
        { label: "Closed Lost", value: "Closed Lost", variant: "danger" },
      ],
    },
    probability: { name: "probability", label: "Probability", type: "number" },
    close_date: { name: "close_date", label: "Close Date", type: "date" },
  },
  defaultLayout: {
    id: "default_opportunity_layout",
    objectType: "opportunity",
    title: "Opportunity Details",
    sections: [
      {
        id: "opportunity_info",
        title: "Opportunity Details",
        columns: 2,
        fields: [
          { name: "name", label: "Name", type: "text", required: true },
          { name: "amount", label: "Amount", type: "currency" },
          { name: "stage", label: "Stage", type: "picklist" },
          { name: "probability", label: "Probability (%)", type: "number" },
          { name: "close_date", label: "Expected Close Date", type: "date" },
        ],
      },
    ],
  },
};

export const CRMObjectRegistry: Record<string, CRMObjectSchema> = {
  lead: LeadSchema,
  account: AccountSchema,
  contact: ContactSchema,
  opportunity: OpportunitySchema,
};

export function getObjectSchema(objectType: string): CRMObjectSchema | null {
  return CRMObjectRegistry[objectType.toLowerCase()] || null;
}
