-- RLS for storage.objects
CREATE POLICY "Admins can upload assets" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can see assets" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'site-assets');
