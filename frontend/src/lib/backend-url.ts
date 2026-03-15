export function getBackendUrl(): string {
  const configured = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  // Fall back to localhost:3001 for local dev when env var is not set
  const url = configured || "http://localhost:3001";
  return url.replace(/\/+$/, "");
}
