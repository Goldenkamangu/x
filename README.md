# LinkHub

This project now works in two modes:

- Local demo mode: data is saved in your browser with `localStorage`, so the site runs immediately without a backend.
- Supabase mode: for a real shared database, connect the app to a Supabase project.

## Quick start

1. Open [marketplace/app.js](marketplace/app.js) and replace the placeholder values:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
2. Create a Supabase project at https://app.supabase.com.
3. In the SQL editor, create these tables:

```sql
create table profiles (
  id uuid primary key references auth.users(id),
  email text,
  display_name text,
  role text,
  created_at timestamptz default now()
);

create table listings (
  id bigint generated always as identity primary key,
  title text not null,
  url text,
  category text,
  description text,
  image_url text,
  user_id uuid references profiles(id),
  created_at timestamptz default now()
);

alter table listings enable row level security;
create policy "Allow insert for authenticated" on listings for insert using (auth.role() = 'authenticated');
create policy "Owners can modify" on listings for update, delete using (user_id = auth.uid());
```

4. Create a storage bucket named `listing-images`.
5. Serve the folder locally:

```bash
cd /home/golden/Desktop/Code/marketplace
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Notes

- Without Supabase credentials, the app uses browser storage so it still works locally.
- For a multi-user marketplace, Supabase is the right choice because every user can share the same database.
