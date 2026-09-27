// يستبدل os.hostname() بقيمة ASCII لتجاوز خطأ ByteString في Vercel CLI
// (اسم الجهاز الأصلي عربي: سحاب — يسبب TypeError عند التحويل ByteString)
const os = require('os');
os.hostname = () => 'sahaab-pc';
