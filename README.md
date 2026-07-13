This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Cross-Device Data Sync (Supabase)

By default, data is stored in browser localStorage. To share the same data between different computers, configure Supabase sync:

1. Create a Supabase project.
2. Run this SQL in Supabase SQL Editor:

```sql
create table if not exists public.app_state (
	id text primary key,
	payload jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.app_state to anon, authenticated;

alter table public.app_state enable row level security;

create policy "allow_public_read"
on public.app_state
for select
to anon
using (true);

create policy "allow_public_write"
on public.app_state
for insert
to anon
with check (true);

create policy "allow_public_update"
on public.app_state
for update
to anon
using (true)
with check (true);
```

3. Add these environment variables in deployment and local `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SYNC_NAMESPACE=main
```

Notes:
- `NEXT_PUBLIC_SYNC_NAMESPACE` lets you separate environments (for example: `dev`, `staging`, `prod`).
- If these env vars are missing, the app falls back to local-only storage.

## Automated Overview Email

The purchase orders page includes a "Send overview" action that auto-builds a stock + order summary and emails it.

Set these environment variables in `.env.local`:

```bash
RESEND_API_KEY=your_resend_api_key
OVERVIEW_EMAIL_FROM=inventory@yourdomain.com
```

Notes:
- `RESEND_API_KEY` is required for the `app/api/overview-email` route.
- `OVERVIEW_EMAIL_FROM` must be a sender accepted by your email provider. If omitted, `onboarding@resend.dev` is used.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
