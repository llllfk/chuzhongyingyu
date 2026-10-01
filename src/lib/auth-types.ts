export type UserRole = "teacher" | "student";

export interface JwtPayload {
  role: UserRole;
  id: number;
  username: string;
  name?: string;
}
