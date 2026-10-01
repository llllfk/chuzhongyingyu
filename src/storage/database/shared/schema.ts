import { pgTable, serial, integer, varchar, timestamp, boolean, text, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 教师表
export const teachers = pgTable("teachers", {
	id: serial("id").primaryKey(),
	username: varchar("username", { length: 64 }).notNull().unique(),
	password_hash: varchar("password_hash", { length: 255 }).notNull(),
	must_change_password: boolean("must_change_password").default(true).notNull(),
	created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("teachers_username_idx").on(table.username),
]);

// 学生表
export const students = pgTable("students", {
	id: serial("id").primaryKey(),
	student_no: varchar("student_no", { length: 64 }).notNull().unique(),
	name: varchar("name", { length: 128 }).notNull(),
	group_name: varchar("group_name", { length: 128 }),
	password_hash: varchar("password_hash", { length: 255 }).notNull(),
	is_active: boolean("is_active").default(true).notNull(),
	created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("students_student_no_idx").on(table.student_no),
	index("students_name_idx").on(table.name),
	index("students_is_active_idx").on(table.is_active),
]);

// 会话表（学生与扣子会话绑定）
export const conversations = pgTable("conversations", {
	id: serial("id").primaryKey(),
	student_id: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
	conversation_id: varchar("conversation_id", { length: 128 }).notNull(),
	created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("conversations_student_id_idx").on(table.student_id),
	index("conversations_conversation_id_idx").on(table.conversation_id),
]);
