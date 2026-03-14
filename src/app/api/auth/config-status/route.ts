import { NextResponse } from "next/server";

function isLikelyConfigured(value: string | undefined, placeholder: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === placeholder) return false;
  return true;
}

export async function GET() {
  const githubClientIdConfigured = isLikelyConfigured(
    process.env.GITHUB_CLIENT_ID,
    "github-oauth-client-id"
  );
  const githubClientSecretConfigured = isLikelyConfigured(
    process.env.GITHUB_CLIENT_SECRET,
    "github-oauth-client-secret"
  );
  const authSecretConfigured = isLikelyConfigured(
    process.env.AUTH_SECRET,
    "replace-with-a-long-random-secret"
  );

  return NextResponse.json({
    githubOauthConfigured:
      githubClientIdConfigured && githubClientSecretConfigured && authSecretConfigured,
  });
}
