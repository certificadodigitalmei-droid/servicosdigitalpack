DROP POLICY IF EXISTS "Authenticated can insert cloud automation settings" ON public.cloud_automation_settings;
DROP POLICY IF EXISTS "Authenticated can read cloud automation settings" ON public.cloud_automation_settings;
DROP POLICY IF EXISTS "Authenticated can update cloud automation settings" ON public.cloud_automation_settings;

CREATE POLICY "Admins can read cloud automation settings"
ON public.cloud_automation_settings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE POLICY "Admins can insert cloud automation settings"
ON public.cloud_automation_settings FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE POLICY "Admins can update cloud automation settings"
ON public.cloud_automation_settings FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));