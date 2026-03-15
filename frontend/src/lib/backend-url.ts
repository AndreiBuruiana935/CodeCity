export function getBackendUrl(): string {
  const configured = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!configured) {
    throw new Error(
      "Backend URL is not configured. Set BACKEND_URL (or NEXT_PUBLIC_BACKEND_URL) in the frontend environment."
    );
  }
  return configured.replace(/\/+$/, "");
}
