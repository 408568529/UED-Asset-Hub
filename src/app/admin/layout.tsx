export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="admin-scope">{children}</div>;
}
