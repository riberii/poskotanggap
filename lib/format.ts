const dateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});
const numFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export const formatDateTime = (iso: string | null) => (iso ? `${dateFmt.format(new Date(iso))} WIB` : "—");
export const formatNumber = (n: number | null) => (n === null ? "—" : numFmt.format(n));
