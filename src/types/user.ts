export type UserRole = "designer" | "lead" | "pm" | "developer" | "qa" | "admin";

export interface User {
  id: string;
  name: string;
  title: string;
  avatarUrl: string;
  role: UserRole;
  bio?: string;
}
