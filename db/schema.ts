import { pgTable, text, integer, timestamp, boolean, date, jsonb, serial, primaryKey, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(), // 'Teacher' | 'Student' | 'Parent'
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const groups = pgTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  totalPoints: integer('total_points').default(0).notNull()
});

export const studentsData = pgTable('students_data', {
  studentId: text('student_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  parentId: text('parent_id').references(() => users.id, { onDelete: 'set null' }),
  groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),
  totalPoints: integer('total_points').default(0).notNull(),
  studentPhone: text('student_phone').default(''),
  parentPhone: text('parent_phone').default(''),
  nazemId: text('nazem_id').default('')
}, (t) => ({
  groupIdx: index('students_group_idx').on(t.groupId),
  parentIdx: index('students_parent_idx').on(t.parentId),
  nazemIdx: index('students_nazem_idx').on(t.nazemId)
}));

export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  dailyTarget: text('daily_target').default(''),
  fromSurah: text('from_surah').default(''),
  fromAyah: text('from_ayah').default(''),
  toSurah: text('to_surah').default(''),
  toAyah: text('to_ayah').default(''),
  amount: text('amount').default(''),
  type: text('type').default('conserve'), // conserve | revision | mastery
  status: text('status').default('Pending'), // Pending | Done | Partial | Missed
  source: text('source').default('Manual'), // Manual | Nazem
  locked: boolean('locked').default(false),
  nazemItemDayId: text('nazem_item_day_id').default(''),
  mistakes: integer('mistakes'),
  hearing: integer('hearing'),
  repetition: integer('repetition'),
  link: integer('link_val'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  studentDateIdx: index('plans_student_date_idx').on(t.studentId, t.date),
  dateIdx: index('plans_date_idx').on(t.date),
  nazemItemIdx: index('plans_nazem_item_idx').on(t.nazemItemDayId)
}));

export const pointItems = pgTable('point_items', {
  id: text('id').primaryKey(),
  description: text('description').notNull(),
  pointValue: integer('point_value').notNull(),
  trigger: text('trigger').default('none') // none | on_done | on_partial | on_review_done | on_attend_present | on_attend_late
});

export const pointLogs = pgTable('point_logs', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  itemId: text('item_id').notNull(),
  teacherId: text('teacher_id').default(''),
  date: date('date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  studentDateIdx: index('logs_student_date_idx').on(t.studentId, t.date)
}));

export const news = pgTable('news', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  visibility: text('visibility').default('All'), // All | Students | Parents
  date: date('date').notNull()
});

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').default(''),
  date: date('date').notNull(),
  type: text('type').default('عام')
});

export const attendance = pgTable('attendance', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  status: text('status').notNull(), // Present | Late | Absent
  note: text('note').default('')
}, (t) => ({
  studentDateIdx: index('att_student_date_idx').on(t.studentId, t.date),
  dateIdx: index('att_date_idx').on(t.date)
}));

export const badges = pgTable('badges', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  title: text('title').notNull(),
  icon: text('icon').default(''),
  date: date('date').notNull()
}, (t) => ({
  studentCodeIdx: index('badges_student_code_idx').on(t.studentId, t.code)
}));

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').default('')
});

export const nazemSession = pgTable('nazem_session', {
  id: integer('id').primaryKey().default(1),
  username: text('username').default(''),
  passwordEnc: text('password_enc').default(''), // encrypted with SESSION_SECRET
  cookies: jsonb('cookies').default({}),
  xsrf: text('xsrf').default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});
