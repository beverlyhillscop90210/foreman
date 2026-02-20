-- Settings Table (Global)
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- User Settings Table (Per-User)
create table public.user_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, key)
);

-- RLS Policies
alter table public.settings enable row level security;
alter table public.user_settings enable row level security;

-- Settings: Viewable by everyone, updatable by admins
create policy "Settings are viewable by everyone" on public.settings for select using (true);
create policy "Only admins can update settings" on public.settings for all using (
  (select role from public.profiles where id = auth.uid()) = 'admin'
);

-- User Settings: Users can manage their own settings
create policy "Users can view their own settings" on public.user_settings for select using (auth.uid() = user_id);
create policy "Users can insert their own settings" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "Users can update their own settings" on public.user_settings for update using (auth.uid() = user_id);
create policy "Users can delete their own settings" on public.user_settings for delete using (auth.uid() = user_id);
