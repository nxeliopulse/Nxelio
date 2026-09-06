/**
 * Fixed option lists for the Buy Leads form. Bright Data's search here is a
 * plain Google "site:linkedin.com/in ..." query — it has no industry/role
 * taxonomy of its own — so we constrain input to LinkedIn's real company
 * industry categories and common decision-maker titles. This keeps the search
 * terms meaningful (matching words that actually appear on real profiles)
 * instead of letting a typo or made-up industry return zero results.
 */

// LinkedIn's standard company "Industry" taxonomy (the categories LinkedIn
// itself assigns to company pages), trimmed to the ones relevant for B2B
// prospecting.
export const LINKEDIN_INDUSTRIES = [
  "Software Development",
  "IT Services and IT Consulting",
  "Computer and Network Security",
  "Technology, Information and Internet",
  "Financial Services",
  "Banking",
  "Investment Management",
  "Insurance",
  "Accounting",
  "Venture Capital and Private Equity",
  "Hospital & Health Care",
  "Medical Practice",
  "Pharmaceuticals",
  "Biotechnology",
  "Retail",
  "E-commerce",
  "Consumer Goods",
  "Apparel & Fashion",
  "Food & Beverages",
  "Manufacturing",
  "Industrial Automation",
  "Automotive",
  "Construction",
  "Real Estate",
  "Logistics and Supply Chain",
  "Transportation, Logistics and Storage",
  "Telecommunications",
  "Marketing and Advertising",
  "Public Relations and Communications",
  "Media Production",
  "Entertainment",
  "Education",
  "E-learning",
  "Higher Education",
  "Non-profit Organizations",
  "Government Administration",
  "Legal Services",
  "Human Resources",
  "Staffing and Recruiting",
  "Management Consulting",
  "Business Consulting and Services",
  "Hospitality",
  "Travel Arrangements",
  "Restaurants",
  "Energy",
  "Oil & Gas",
  "Renewable Energy",
  "Agriculture",
  "Environmental Services",
] as const;

// Common decision-maker / buyer-persona job titles for B2B outreach — shown
// when no industry is picked ("Any industry"), and layered into every
// industry-specific list below since a sales/marketing/ops leader is a
// plausible outreach target no matter the vertical.
export const COMMON_ROLES = [
  "CEO",
  "COO",
  "CFO",
  "CTO",
  "CMO",
  "CIO",
  "Founder",
  "Co-Founder",
  "President",
  "VP of Sales",
  "VP of Marketing",
  "VP of Engineering",
  "VP of Product",
  "VP of Operations",
  "Head of Sales",
  "Head of Marketing",
  "Head of Growth",
  "Head of Product",
  "Head of Engineering",
  "Head of Customer Success",
  "Director of Sales",
  "Director of Marketing",
  "Director of Operations",
  "Director of Business Development",
  "Sales Manager",
  "Marketing Manager",
  "Product Manager",
  "Business Development Manager",
  "IT Manager",
  "Procurement Manager",
] as const;

// Cross-industry leadership titles — a plausible buyer persona at almost any
// company, so every industry-specific list below starts from this before
// adding the functional titles unique to that vertical.
const EXEC_CORE = ["CEO", "Founder", "Co-Founder", "President", "COO", "VP of Sales", "VP of Marketing", "VP of Operations"];

const TECH_ROLES = [...EXEC_CORE, "CTO", "CIO", "VP of Engineering", "VP of Product", "Head of Engineering", "Head of Product", "Engineering Manager", "Product Manager", "DevOps Manager", "Solutions Architect", "IT Manager"];
const SECURITY_ROLES = [...EXEC_CORE, "CTO", "CISO", "VP of Engineering", "Head of Security", "Security Engineering Manager", "IT Manager", "Compliance Manager"];
const FINANCE_ROLES = [...EXEC_CORE, "CFO", "VP of Finance", "Finance Manager", "Controller", "Financial Analyst", "Risk Manager", "Compliance Officer"];
const BANKING_ROLES = [...EXEC_CORE, "CFO", "Branch Manager", "Relationship Manager", "Credit Risk Manager", "Compliance Officer", "Treasury Manager"];
const INSURANCE_ROLES = [...EXEC_CORE, "CFO", "VP of Underwriting", "Underwriting Manager", "Claims Manager", "Risk Manager", "Compliance Officer"];
const ACCOUNTING_ROLES = [...EXEC_CORE, "CFO", "Managing Partner", "Audit Manager", "Tax Manager", "Controller"];
const VC_PE_ROLES = [...EXEC_CORE, "Managing Partner", "General Partner", "Principal", "Investment Manager", "Portfolio Manager", "Analyst"];
const HEALTHCARE_ROLES = [...EXEC_CORE, "Chief Medical Officer", "Medical Director", "Clinical Director", "VP of Clinical Operations", "Practice Manager", "Nursing Director"];
const PHARMA_BIOTECH_ROLES = [...EXEC_CORE, "VP of R&D", "Research Director", "Clinical Trials Manager", "Regulatory Affairs Manager", "Head of Research", "Scientific Director"];
const RETAIL_CONSUMER_ROLES = [...EXEC_CORE, "VP of Merchandising", "Category Manager", "Buyer", "Store Manager", "Brand Manager", "VP of E-commerce"];
const FOOD_BEV_ROLES = [...EXEC_CORE, "VP of Merchandising", "Brand Manager", "Category Manager", "Supply Chain Manager", "Executive Chef"];
const MANUFACTURING_ROLES = [...EXEC_CORE, "Plant Manager", "Production Manager", "Quality Manager", "Supply Chain Manager", "Procurement Manager"];
const AUTOMOTIVE_ROLES = [...EXEC_CORE, "Plant Manager", "Quality Manager", "Supply Chain Manager", "Service Manager", "Procurement Manager"];
const CONSTRUCTION_ROLES = [...EXEC_CORE, "Project Manager", "Site Manager", "Estimator", "Procurement Manager", "Safety Manager"];
const REAL_ESTATE_ROLES = [...EXEC_CORE, "Property Manager", "Leasing Manager", "Asset Manager", "Broker", "Development Manager"];
const LOGISTICS_ROLES = [...EXEC_CORE, "Logistics Manager", "Fleet Manager", "Warehouse Manager", "Supply Chain Manager", "Procurement Manager"];
const TELECOM_ROLES = [...EXEC_CORE, "CTO", "VP of Engineering", "Network Operations Manager", "Product Manager"];
const MARKETING_MEDIA_ROLES = [...EXEC_CORE, "CMO", "Creative Director", "Content Director", "Brand Manager", "Communications Director", "PR Manager"];
const EDUCATION_ROLES = [...EXEC_CORE, "Dean", "Program Director", "Department Head", "Curriculum Director", "Admissions Director"];
const NONPROFIT_GOV_ROLES = [...EXEC_CORE, "Executive Director", "Program Director", "Development Director", "Policy Director", "Grants Manager"];
const LEGAL_ROLES = [...EXEC_CORE, "General Counsel", "Managing Partner", "Senior Associate", "Compliance Officer", "Legal Operations Manager"];
const HR_STAFFING_ROLES = [...EXEC_CORE, "VP of HR", "HR Manager", "Talent Acquisition Manager", "Recruiting Manager", "People Operations Manager"];
const CONSULTING_ROLES = [...EXEC_CORE, "Managing Director", "Principal Consultant", "Engagement Manager", "Practice Lead", "Senior Consultant"];
const HOSPITALITY_ROLES = [...EXEC_CORE, "General Manager", "Guest Services Manager", "Revenue Manager", "Executive Chef", "Front Office Manager"];
const ENERGY_ROLES = [...EXEC_CORE, "Plant Manager", "Field Operations Manager", "Sustainability Director", "Environmental Compliance Manager"];
const AGRICULTURE_ROLES = [...EXEC_CORE, "Farm Manager", "Supply Chain Manager", "Sustainability Director", "Procurement Manager"];

/** Buyer-persona titles worth targeting for each LinkedIn industry — shown in
 *  the Role dropdown once an industry is picked, in place of the generic
 *  COMMON_ROLES list. Every list starts from EXEC_CORE, so switching industry
 *  narrows (not replaces) who counts as a plausible decision-maker. */
export const INDUSTRY_ROLES: Partial<Record<(typeof LINKEDIN_INDUSTRIES)[number], readonly string[]>> = {
  "Software Development": TECH_ROLES,
  "IT Services and IT Consulting": TECH_ROLES,
  "Computer and Network Security": SECURITY_ROLES,
  "Technology, Information and Internet": TECH_ROLES,
  "Financial Services": FINANCE_ROLES,
  "Banking": BANKING_ROLES,
  "Investment Management": FINANCE_ROLES,
  "Insurance": INSURANCE_ROLES,
  "Accounting": ACCOUNTING_ROLES,
  "Venture Capital and Private Equity": VC_PE_ROLES,
  "Hospital & Health Care": HEALTHCARE_ROLES,
  "Medical Practice": HEALTHCARE_ROLES,
  "Pharmaceuticals": PHARMA_BIOTECH_ROLES,
  "Biotechnology": PHARMA_BIOTECH_ROLES,
  "Retail": RETAIL_CONSUMER_ROLES,
  "E-commerce": RETAIL_CONSUMER_ROLES,
  "Consumer Goods": RETAIL_CONSUMER_ROLES,
  "Apparel & Fashion": RETAIL_CONSUMER_ROLES,
  "Food & Beverages": FOOD_BEV_ROLES,
  "Manufacturing": MANUFACTURING_ROLES,
  "Industrial Automation": MANUFACTURING_ROLES,
  "Automotive": AUTOMOTIVE_ROLES,
  "Construction": CONSTRUCTION_ROLES,
  "Real Estate": REAL_ESTATE_ROLES,
  "Logistics and Supply Chain": LOGISTICS_ROLES,
  "Transportation, Logistics and Storage": LOGISTICS_ROLES,
  "Telecommunications": TELECOM_ROLES,
  "Marketing and Advertising": MARKETING_MEDIA_ROLES,
  "Public Relations and Communications": MARKETING_MEDIA_ROLES,
  "Media Production": MARKETING_MEDIA_ROLES,
  "Entertainment": MARKETING_MEDIA_ROLES,
  "Education": EDUCATION_ROLES,
  "E-learning": EDUCATION_ROLES,
  "Higher Education": EDUCATION_ROLES,
  "Non-profit Organizations": NONPROFIT_GOV_ROLES,
  "Government Administration": NONPROFIT_GOV_ROLES,
  "Legal Services": LEGAL_ROLES,
  "Human Resources": HR_STAFFING_ROLES,
  "Staffing and Recruiting": HR_STAFFING_ROLES,
  "Management Consulting": CONSULTING_ROLES,
  "Business Consulting and Services": CONSULTING_ROLES,
  "Hospitality": HOSPITALITY_ROLES,
  "Travel Arrangements": HOSPITALITY_ROLES,
  "Restaurants": HOSPITALITY_ROLES,
  "Energy": ENERGY_ROLES,
  "Oil & Gas": ENERGY_ROLES,
  "Renewable Energy": ENERGY_ROLES,
  "Agriculture": AGRICULTURE_ROLES,
  "Environmental Services": ENERGY_ROLES,
};

/** Role options for the Buy Leads form: industry-specific once one is
 *  picked, otherwise the generic cross-industry list. */
export function getRolesForIndustry(industry: string): readonly string[] {
  return INDUSTRY_ROLES[industry as (typeof LINKEDIN_INDUSTRIES)[number]] ?? COMMON_ROLES;
}
