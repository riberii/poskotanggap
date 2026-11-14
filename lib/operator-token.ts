// Token sesi operator (sama dengan isi cookie) disimpan di sessionStorage sebagai cadangan bila cookie tidak tersimpan.
const KEY = "poskotanggap:op-token";
export const getOperatorToken = (): string | null => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};
export const setOperatorToken = (t: string | null) => {
  try {
    if (t) sessionStorage.setItem(KEY, t);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Tidak kritis.
  }
};
export const authHeaders = (): Record<string, string> => {
  const t = getOperatorToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};
