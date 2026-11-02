/** GST state / UT codes (first two digits of a GSTIN). Legacy 25 and 28 retained for GSTIN parsing only. */
export interface StateInfo {
  code: string;
  name: string;
  isUT: boolean;
  /** UTs without legislature levy UTGST instead of SGST */
  utgst: boolean;
  legacy?: boolean;
}

export const STATES: StateInfo[] = [
  { code: "01", name: "Jammu and Kashmir", isUT: true, utgst: false },
  { code: "02", name: "Himachal Pradesh", isUT: false, utgst: false },
  { code: "03", name: "Punjab", isUT: false, utgst: false },
  { code: "04", name: "Chandigarh", isUT: true, utgst: true },
  { code: "05", name: "Uttarakhand", isUT: false, utgst: false },
  { code: "06", name: "Haryana", isUT: false, utgst: false },
  { code: "07", name: "Delhi", isUT: true, utgst: false },
  { code: "08", name: "Rajasthan", isUT: false, utgst: false },
  { code: "09", name: "Uttar Pradesh", isUT: false, utgst: false },
  { code: "10", name: "Bihar", isUT: false, utgst: false },
  { code: "11", name: "Sikkim", isUT: false, utgst: false },
  { code: "12", name: "Arunachal Pradesh", isUT: false, utgst: false },
  { code: "13", name: "Nagaland", isUT: false, utgst: false },
  { code: "14", name: "Manipur", isUT: false, utgst: false },
  { code: "15", name: "Mizoram", isUT: false, utgst: false },
  { code: "16", name: "Tripura", isUT: false, utgst: false },
  { code: "17", name: "Meghalaya", isUT: false, utgst: false },
  { code: "18", name: "Assam", isUT: false, utgst: false },
  { code: "19", name: "West Bengal", isUT: false, utgst: false },
  { code: "20", name: "Jharkhand", isUT: false, utgst: false },
  { code: "21", name: "Odisha", isUT: false, utgst: false },
  { code: "22", name: "Chhattisgarh", isUT: false, utgst: false },
  { code: "23", name: "Madhya Pradesh", isUT: false, utgst: false },
  { code: "24", name: "Gujarat", isUT: false, utgst: false },
  { code: "25", name: "Daman and Diu (legacy)", isUT: true, utgst: true, legacy: true },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu", isUT: true, utgst: true },
  { code: "27", name: "Maharashtra", isUT: false, utgst: false },
  { code: "28", name: "Andhra Pradesh (legacy)", isUT: false, utgst: false, legacy: true },
  { code: "29", name: "Karnataka", isUT: false, utgst: false },
  { code: "30", name: "Goa", isUT: false, utgst: false },
  { code: "31", name: "Lakshadweep", isUT: true, utgst: true },
  { code: "32", name: "Kerala", isUT: false, utgst: false },
  { code: "33", name: "Tamil Nadu", isUT: false, utgst: false },
  { code: "34", name: "Puducherry", isUT: true, utgst: false },
  { code: "35", name: "Andaman and Nicobar Islands", isUT: true, utgst: true },
  { code: "36", name: "Telangana", isUT: false, utgst: false },
  { code: "37", name: "Andhra Pradesh", isUT: false, utgst: false },
  { code: "38", name: "Ladakh", isUT: true, utgst: true },
  { code: "97", name: "Other Territory", isUT: true, utgst: true },
];

const byCode = new Map(STATES.map((s) => [s.code, s]));

export function getState(code: string | null | undefined): StateInfo | undefined {
  return code ? byCode.get(code) : undefined;
}

export function stateName(code: string | null | undefined): string {
  return getState(code)?.name ?? "Unknown state";
}

/** States selectable as place of supply / registration today */
export const SELECTABLE_STATES = STATES.filter((s) => !s.legacy);

export function isSelectableStateCode(code: string): boolean {
  const s = byCode.get(code);
  return !!s && !s.legacy;
}

/** Label for the second tax head on an intra-state supply */
export function stateTaxLabel(code: string | null | undefined): "SGST" | "UTGST" {
  return getState(code)?.utgst ? "UTGST" : "SGST";
}
