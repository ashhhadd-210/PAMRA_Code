# Supabase setup for the PAMRA Reviews page

The Reviews page (`/reviews`) stores submissions in a Supabase Postgres table and reads them back over HTTPS using the Supabase REST API. The Reviews UI is the only feature that talks to Supabase — everything else in the demo remains local Node.js.

This guide takes ~5 minutes if you already have a Supabase account.

---

## 1 · Create a Supabase project

1. Go to https://supabase.com and sign in (or sign up; the free tier is enough).
2. Click **New project**.
3. Name it (e.g. `pamra-demo`), choose a region close to you (e.g. Singapore for Pakistan), set a database password (save it; you won't need it for this demo), and create.
4. Wait ~1 minute for provisioning.

## 2 · Create the `reviews` table + Row-Level Security

In the Supabase dashboard, go to **SQL Editor** → **New query**. Paste the SQL below and click **Run**.

```sql
-- ──── Schema ────
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  role        text not null check (role in ('Farmer','Trader','Government Official','Committee Member','Other')),
  rating      integer not null check (rating between 1 and 5),
  comment     text not null check (char_length(comment) between 1 and 1000),
  approved    boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists reviews_created_at_idx on public.reviews (created_at desc);

-- ──── Row-Level Security ────
-- Without RLS, the anon key would expose write access broadly.
alter table public.reviews enable row level security;

-- Anyone (including unauthenticated visitors) can read APPROVED reviews.
create policy "Public can read approved reviews"
  on public.reviews
  for select
  using (approved = true);

-- Anyone can INSERT a review. Auto-publish for the demo (approved defaults to true).
-- For production, change the default of `approved` to false and add an admin policy
-- to approve via the dashboard or a service-role script.
create policy "Public can insert reviews"
  on public.reviews
  for insert
  with check (true);
```

After running, you should see `Success. No rows returned.` under the query.

## 3 · Get your Project URL + anon key

1. In the Supabase dashboard, click the gear icon → **API**.
2. Copy two values:
   - **Project URL** — looks like `https://abcdwxyz.supabase.co`
   - **Project API keys → anon / public** — long string starting with `eyJ…`

> Use the **anon** key, not the service-role key. Service-role bypasses RLS and should never end up in client-side code.

## 4 · Paste them into the demo

Open `public/supabase-config.js` and replace the placeholders:

```js
window.SUPABASE_CONFIG = {
  url:     'https://abcdwxyz.supabase.co',     // ← your Project URL
  anonKey: 'eyJhbGciOi...your-anon-key-here'   // ← your anon / public key
};
```

Save the file. (No build step — the server serves it as-is.)

## 5 · Try it

1. Make sure the PAMRA server is running:
   ```bash
   npm start
   ```
2. Open http://localhost:3000/reviews
3. Submit a review using the form on the right.
4. Watch it appear instantly on the left, both in the rating summary and the list.

Reload — the review persists because it's stored in Supabase, not in browser memory.

## 6 · Verify in the Supabase dashboard

In the Supabase dashboard go to **Table Editor → reviews** to see the rows. You can edit or delete reviews from here, or flip `approved` to `false` to hide one.

---

## Production hardening (not needed for the demo)

If you ever take this beyond a demo, consider:

| Concern | Action |
|---|---|
| Review spam | Change `approved` default to `false`. Add a moderator UI or a Supabase Edge Function trigger that auto-approves only after rate-limit + profanity checks. |
| Rate limiting | Use Supabase Edge Functions or an API gateway in front of the REST endpoint. |
| Authentication | Tie reviews to authenticated users via `auth.users` and a `user_id` column. |
| CORS lock-down | In Supabase project → API → CORS, restrict origins to your deployed domain. |
| PII / abusive content | Add a `flagged` boolean and a `select` policy that hides flagged rows. |

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Reviews page shows "Demo not yet connected" banner | Placeholder values are still in `supabase-config.js`. Replace them and refresh. |
| Submission fails with `401` | The anon key is wrong, or RLS policies weren't created. Re-run the SQL in step 2. |
| Submission fails with `403` | The insert policy is missing — re-run step 2 carefully. |
| Reviews submit but never appear | Your read policy requires `approved = true`. Check the `approved` column on your row in **Table Editor**. |
| `relation "reviews" does not exist` | The SQL didn't run on the `public` schema. Run it again in the SQL Editor. |
