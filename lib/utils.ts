export const TZ = 'Asia/Riyadh';
export const SURAHS = ['الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس','هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه','الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم','لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر','فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق','الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة','الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج','نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس','التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر','البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة','العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون','النصر','المسد','الإخلاص','الفلق','الناس'];

export function genId(prefix: string) { return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 999)}`; }
export function today() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return parts; // yyyy-MM-dd
}
export function normAr(s: string) {
  if (!s) return '';
  return String(s).toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/\s+/g, ' ').trim();
}
export function buildPlanTarget(p: { fromSurah?: string; fromAyah?: string|null; toSurah?: string; toAyah?: string|null; amount?: string|null }) {
  const a: string[] = [];
  if (p.fromSurah) a.push('من سورة ' + p.fromSurah + (p.fromAyah ? ' آية ' + p.fromAyah : ''));
  if (p.toSurah) a.push('إلى سورة ' + p.toSurah + (p.toAyah ? ' آية ' + p.toAyah : ''));
  let s = a.join(' ');
  if (p.amount) s += (s ? ' ' : '') + '(' + p.amount + ')';
  return s.trim();
}
export function surahIndex(name: string) { return SURAHS.indexOf(String(name || '').trim()) + 1; }

// عدد آيات كل سورة (بترتيب SURAHS)، رواية حفص عن عاصم.
export const SURAH_AYAH_COUNT: number[] = [
  7,286,200,176,120,165,206,75,129,109,      // 1-10
  123,111,43,52,99,128,111,110,98,135,       // 11-20
  112,78,118,64,77,227,93,88,69,60,          // 21-30
  34,30,73,54,45,83,182,88,75,85,            // 31-40
  54,53,89,59,37,35,38,29,18,45,             // 41-50
  60,49,62,55,78,96,29,22,24,13,             // 51-60
  14,11,11,18,12,12,30,52,52,44,             // 61-70
  28,28,20,56,40,31,50,40,46,42,             // 71-80
  29,19,36,25,22,17,19,26,30,20,             // 81-90
  15,21,11,8,8,19,5,8,8,11,                  // 91-100
  11,8,3,9,5,4,7,3,6,3,                      // 101-110
  5,4,5,6                                     // 111-114
];
export function ayahCountOf(surah: string): number {
  const i = SURAHS.indexOf(String(surah||'').trim());
  return i>=0 ? SURAH_AYAH_COUNT[i] : 0;
}
/** الرقم التسلسلي للآية عبر المصحف (1..6236) بمعطى سورة+آية. 0 إن غير صالح. */
export function ayahOrdinal(surah: string, ayah: number): number {
  const i = SURAHS.indexOf(String(surah||'').trim());
  if (i < 0) return 0;
  const a = Math.max(1, Math.min(Number(ayah)||1, SURAH_AYAH_COUNT[i]));
  let n = 0;
  for (let k=0; k<i; k++) n += SURAH_AYAH_COUNT[k];
  return n + a;
}
/** يعيد {surah, ayah} من الرقم التسلسلي عبر المصحف. */
export function fromOrdinal(ord: number): { surah: string; ayah: number } | null {
  let n = Math.max(1, Math.floor(ord));
  for (let i=0; i<SURAHS.length; i++) {
    if (n <= SURAH_AYAH_COUNT[i]) return { surah: SURAHS[i], ayah: n };
    n -= SURAH_AYAH_COUNT[i];
  }
  return null;
}
