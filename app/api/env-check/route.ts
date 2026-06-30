export const dynamic = "force-dynamic";

function maskedPreview(value: string | undefined) {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const namespace = process.env.NEXT_PUBLIC_SYNC_NAMESPACE;

  return Response.json({
    ok: Boolean(url && anonKey),
    env: {
      NEXT_PUBLIC_SUPABASE_URL: {
        present: Boolean(url),
        preview: maskedPreview(url),
      },
      NEXT_PUBLIC_SUPABASE_ANON_KEY: {
        present: Boolean(anonKey),
        preview: maskedPreview(anonKey),
        length: anonKey?.length ?? 0,
      },
      NEXT_PUBLIC_SYNC_NAMESPACE: {
        present: Boolean(namespace),
        value: namespace || null,
      },
    },
    checkedAt: new Date().toISOString(),
  });
}