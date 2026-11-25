create policy "customers_can_read_own_profile" on public.customer_profiles for select to authenticated using (auth.uid() = user_id);
