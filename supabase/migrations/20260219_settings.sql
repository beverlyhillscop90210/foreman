-- Settings Table (Global)
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- User Settings Table (Per-User)
create table public.user_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, key)
);

-- RLS Policies
alter table public.settings enable row level security;
alter table public.user_settings enable row level security;

-- Settings: Viewable by everyone, updatable by authenticated users (UI restricts access)
create policy "Settings are viewable by everyone" on public.settings for select using (true);
create policy "Authenticated users can update settings" on public.settings for all using (
  auth.role() = 'authenticated'
);

-- User Settings: Users can manage their own settings
create policy "Users can view their own settings" on public.user_settings for select using (auth.uid() = user_id);
create policy "Users can insert their own settings" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "Users can update their own settings" on public.user_settings for update using (auth.uid() = user_id);
create policy "Users can delete their own settings" on public.user_settings for delete using (auth.uid() = user_id);
