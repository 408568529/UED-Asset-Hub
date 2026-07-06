"use client";

type FormToastProps = {
  message: string;
  tone?: "success" | "error" | "warning";
};

export function FormToast({ message, tone = "success" }: FormToastProps) {
  if (!message) return null;

  return (
    <div
      className={`fixed right-5 top-5 z-50 border px-4 py-3 text-sm font-bold shadow-2xl ${
        tone === "success"
          ? "border-foreground bg-foreground text-white"
          : tone === "warning"
            ? "border-primary bg-primary text-foreground"
            : "border-red-600 bg-red-600 text-white"
      }`}
      role="status"
    >
      {message}
    </div>
  );
}
