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
