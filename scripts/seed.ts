import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log('🌱 Seeding initial data...');
  const hash = (p: string) => bcrypt.hashSync(p, 10);

  // Teacher
  await sql`INSERT INTO users (id,name,role,password_hash) VALUES ('U_001','الأستاذ أحمد','Teacher',${hash('1234')}) ON CONFLICT (id) DO NOTHING`;
  // Student
  await sql`INSERT INTO users (id,name,role,password_hash) VALUES ('U_002','عبدالله','Student',${hash('1111')}) ON CONFLICT (id) DO NOTHING`;
  // Parent
  await sql`INSERT INTO users (id,name,role,password_hash) VALUES ('U_003','والد عبدالله','Parent',${hash('2222')}) ON CONFLICT (id) DO NOTHING`;

  await sql`INSERT INTO groups (id,name,total_points) VALUES ('G_001','المجموعة الأولى',0) ON CONFLICT (id) DO NOTHING`;
  await sql`INSERT INTO students_data (student_id,parent_id,group_id) VALUES ('U_002','U_003','G_001') ON CONFLICT (student_id) DO NOTHING`;

  // Default point items
  const items: [string,string,number,string][] = [
    ['I_001','إتمام الحفظ اليومي',10,'on_done'],
    ['I_002','المراجعة',5,'on_review_done'],
    ['I_003','الحضور',2,'on_attend_present'],
    ['I_004','إتقان بلا أخطاء',3,'none'],
    ['I_005','تأخر/تقصير',-5,'none']
  ];
  for (const [id, d, v, tr] of items) {
    await sql`INSERT INTO point_items (id,description,point_value,trigger) VALUES (${id},${d},${v},${tr}) ON CONFLICT (id) DO NOTHING`;
  }

  // Welcome news
  await sql`INSERT INTO news (id,title,body,visibility,date)
            VALUES ('N_001','مرحباً بكم','نسأل الله أن يبارك في حفظكم.','All',CURRENT_DATE)
            ON CONFLICT (id) DO NOTHING`;

  console.log('✅ Seed complete. Login:');
  console.log('   Teacher: U_001 / 1234');
  console.log('   Student: U_002 / 1111');
  console.log('   Parent:  U_003 / 2222');
}

main().catch(e => { console.error(e); process.exit(1); });
