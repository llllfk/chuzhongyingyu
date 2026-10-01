import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware-auth";
import { isCozeConfigured, getBotIntro } from "@/lib/coze-client";

export async function GET(request: Request) {
  const authResult = requireAuth(request.headers, ["student"]);
  if ("error" in authResult || authResult instanceof NextResponse) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  if (!isCozeConfigured()) {
    return NextResponse.json(
      { error: "系统配置中，请联系教师", intro_message: "", suggested_questions: [] },
      { status: 503 },
    );
  }

  try {
    const intro = await getBotIntro();
    return NextResponse.json({
      intro_message: intro.intro_message,
      suggested_questions: intro.suggested_questions,
    });
  } catch (err) {
    const error = err as Error;
    return NextResponse.json(
      { error: "获取开场白失败", detail: error.message },
      { status: 500 },
    );
  }
}
