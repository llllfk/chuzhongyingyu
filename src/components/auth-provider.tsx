"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/auth-types";

interface AuthUser {
  role: UserRole;
  id: number;
  username: string;
  name?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{
    success: boolean;
    error?: string;
    must_change_password?: boolean;
    role?: UserRole;
  }>;
  logout: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "edu_ai_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // 从 token 解析用户信息
  const parseToken = useCallback((token: string): AuthUser | null => {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return {
        role: payload.role as UserRole,
        id: payload.id,
        username: payload.username,
        name: payload.name,
      };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      const parsed = parseToken(token);
      if (parsed) {
        setUser(parsed);
      }
    }
    setLoading(false);
  }, [parseToken]);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { success: false, error: data.error || "登录失败" };
        }
        localStorage.setItem(TOKEN_KEY, data.token);
        const parsed = parseToken(data.token);
        setUser(parsed);
        return {
          success: true,
          must_change_password: data.must_change_password,
          role: data.role,
        };
      } catch {
        return { success: false, error: "网络错误，请重试" };
      }
    },
    [parseToken],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    router.push("/login");
  }, [router]);

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return { success: false, error: "未登录" };
      try {
        const res = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            old_password: oldPassword,
            new_password: newPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { success: false, error: data.error || "修改失败" };
        }
        return { success: true };
      } catch {
        return { success: false, error: "网络错误，请重试" };
      }
    },
    [],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
