-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles Table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- API Keys Table
create table public.api_keys (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null, -- e.g., 'openrouter', 'gemini'
  key_value text not null,
  is_shared boolean default false, -- If true, users can USE it, but not READ it
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Personal Access Tokens (for MCP Server)
create table public.personal_access_tokens (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  token text not null unique,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.api_keys enable row level security;
alter table public.personal_access_tokens enable row level security;

-- Profiles: Viewable by everyone, updatable by admins
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Only admins can update profiles" on public.profiles for update using (
  (select role from public.profiles where id = auth.uid()) = 'admin'
);

-- API Keys: Users can manage their own keys
create policy "Users can view their own keys" on public.api_keys for select using (auth.uid() = user_id);
create policy "Users can insert their own keys" on public.api_keys for insert with check (auth.uid() = user_id);
create policy "Users can update their own keys" on public.api_keys for update using (auth.uid() = user_id);
create policy "Users can delete their own keys" on public.api_keys for delete using (auth.uid() = user_id);

-- PATs: Users can manage their own tokens
create policy "Users can view their own PATs" on public.personal_access_tokens for select using (auth.uid() = user_id);
create policy "Users can insert their own PATs" on public.personal_access_tokens for insert with check (auth.uid() = user_id);
create policy "Users can delete their own PATs" on public.personal_access_tokens for delete using (auth.uid() = user_id);

-- Trigger to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when new.email = 'peterschings@gmail.com' then 'admin' else 'user' end);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
