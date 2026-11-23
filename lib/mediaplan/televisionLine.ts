/** A burst's TARPs as a number (Television's summary; W5h). */
export const tarpsOf = (burst: Record<string, unknown>) =>
  parseFloat(String(burst.tarps ?? "").replace(/[^0-9.]/g, "") || "0") || 0
