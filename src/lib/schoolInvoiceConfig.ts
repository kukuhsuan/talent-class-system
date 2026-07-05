export const SCHOOL_INVOICE_BRANDS = ["優比熊", "運動班長"] as const;
export type SchoolInvoiceBrand = (typeof SCHOOL_INVOICE_BRANDS)[number];

export const SCHOOL_INVOICE_COMPANY = {
  companyName: "威斯博國際股份有限公司",
  phone: "(02)2976-3534",
  fax: "(02)2973-3107",
  bankName: "玉山銀行 東三重分行",
  bankAccount: "0853-940-024817",
  accountName: "威斯博國際股份有限公司",
};

export const SCHOOL_INVOICE_BRAND_ACCOUNTS: Record<SchoolInvoiceBrand, typeof SCHOOL_INVOICE_COMPANY> = {
  優比熊: {
    companyName: "威斯博國際股份有限公司",
    phone: "(02)2976-3534",
    fax: "(02)2973-3107",
    bankName: "玉山銀行 東三重分行",
    bankAccount: "0853-940-024817",
    accountName: "威斯博國際股份有限公司",
  },
  運動班長: {
    companyName: "威斯博國際股份有限公司",
    phone: "(02)2976-3534",
    fax: "(02)2973-3107",
    bankName: "國泰世華銀行 北三重分行",
    bankAccount: "039-03-500886-5",
    accountName: "威斯博國際股份有限公司",
  },
};

export function normalizeInvoiceBrand(value: string | null | undefined): SchoolInvoiceBrand | "" {
  const text = String(value ?? "").trim();
  return SCHOOL_INVOICE_BRANDS.includes(text as SchoolInvoiceBrand) ? text as SchoolInvoiceBrand : "";
}

export function defaultInvoiceBrand(departments: Array<string | null | undefined>, schoolType = ""): SchoolInvoiceBrand {
  const values = departments.map((item) => String(item ?? "").trim()).filter(Boolean);
  const source = values.length ? values : [schoolType];
  return source.some((item) => item.includes("國小") || item.includes("安親")) ? "運動班長" : "優比熊";
}

export function invoiceCompanyForBrand(brandName: string | null | undefined) {
  const brand = normalizeInvoiceBrand(brandName) || "優比熊";
  return SCHOOL_INVOICE_BRAND_ACCOUNTS[brand];
}
