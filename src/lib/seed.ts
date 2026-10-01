import 'server-only';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { hashPassword } from "@/lib/auth";

export async function seedDefaultTeacher() {
  try {
    const client = getSupabaseClient();
    // 检查 admin 是否存在
    const { data: existing } = await client
      .from("teachers")
      .select("id")
      .eq("username", "admin")
      .maybeSingle();

    if (existing) {
      console.log("[seed] admin 教师已存在，跳过");
      return;
    }

    const passwordHash = await hashPassword("Admin@2026");
    const { error } = await client
      .from("teachers")
      .insert({
        username: "admin",
        password_hash: passwordHash,
        must_change_password: true,
      });

    if (error) {
      console.error("[seed] 创建 admin 失败:", error.message);
    } else {
      console.log("[seed] 已创建默认教师账号: admin / Admin@2026");
    }
  } catch (err) {
    console.error("[seed] 初始化失败:", err);
  }
}
