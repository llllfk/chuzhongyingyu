import { NextResponse } from "next/server";
import { getTokenFromAuthHeader, verifyToken } from "./auth";
import type { UserRole, JwtPayload } from "./auth-types";

export function getAuthUser(headers: Headers): JwtPayload | null {
  const token = getTokenFromAuthHeader(headers.get("authorization"));
  if (!token) return null;
  return verifyToken(token);
}

export function requireAuth(headers: Headers, roles?: UserRole[]): JwtPayload | NextResponse {
  const user = getAuthUser(headers);
  if (!user) {
    return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
  }
  if (roles && !roles.includes(user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }
  return user;
}

export function isNextResponse(obj: unknown): obj is NextResponse {
  return obj instanceof NextResponse;
}
