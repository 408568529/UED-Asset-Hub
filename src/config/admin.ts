export const adminCredentials = {
  username: process.env.NEXT_PUBLIC_ADMIN_USERNAME || "admin",
  password: process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin123",
  token: "mock-token"
};

export const ADMIN_TOKEN_KEY = "ued_admin_token";
export const ADMIN_PASSWORD_KEY = "ued_admin_password";
