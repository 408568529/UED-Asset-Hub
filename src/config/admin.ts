export const adminCredentials = {
  username: process.env.ADMIN_USERNAME || "admin",
  password: process.env.ADMIN_PASSWORD || "admin123"
};

export const ADMIN_SESSION_COOKIE = "ued_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8;
export const adminSessionSecret = process.env.ADMIN_SESSION_SECRET || `${adminCredentials.username}:${adminCredentials.password}:ued-asset-hub`;
