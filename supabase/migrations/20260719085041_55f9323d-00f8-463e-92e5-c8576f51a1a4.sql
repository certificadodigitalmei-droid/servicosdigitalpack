
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;

DROP POLICY IF EXISTS "Admins can see all profiles" ON public.admin_profiles;
CREATE POLICY "Admins can see all profiles" ON public.admin_profiles
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can see api logs" ON public.api_logs;
CREATE POLICY "Admins can see api logs" ON public.api_logs
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can manage settings" ON public.aquicnpj_settings;
CREATE POLICY "Admins can manage settings" ON public.aquicnpj_settings
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'))
  WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can manage companies" ON public.companies;
CREATE POLICY "Admins can manage companies" ON public.companies
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'))
  WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can manage links" ON public.company_links;
CREATE POLICY "Admins can manage links" ON public.company_links
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'))
  WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can manage queue" ON public.contact_queue;
CREATE POLICY "Admins can manage queue" ON public.contact_queue
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'))
  WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can update site settings" ON public.site_settings;
CREATE POLICY "Admins can update site settings" ON public.site_settings
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin'))
  WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can manage suppression" ON public.suppression_list;
CREATE POLICY "Admins can manage suppression" ON public.suppression_list
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'))
  WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can see sync runs" ON public.sync_runs;
CREATE POLICY "Admins can see sync runs" ON public.sync_runs
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins can upload assets" ON storage.objects;
CREATE POLICY "Admins can upload assets" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'site-assets' AND private.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'site-assets' AND private.has_role(auth.uid(),'admin'));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

DROP POLICY IF EXISTS "Anyone can see companies via public links" ON public.companies;
CREATE POLICY "Companies visible only via active link"
  ON public.companies FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.company_links cl
      WHERE cl.company_id = companies.id
        AND cl.active = true
        AND (cl.expires_at IS NULL OR cl.expires_at > now())
    )
  );

DROP POLICY IF EXISTS "Anyone can read link by token" ON public.company_links;
CREATE POLICY "Active links readable by token lookup"
  ON public.company_links FOR SELECT TO anon
  USING (
    active = true
    AND (expires_at IS NULL OR expires_at > now())
  );

DROP POLICY IF EXISTS "public can insert customers" ON public.customers;
CREATE POLICY "public can insert customers"
  ON public.customers FOR INSERT TO anon, authenticated
  WITH CHECK (
    name IS NOT NULL AND length(btrim(name)) BETWEEN 2 AND 200
    AND document IS NOT NULL AND length(btrim(document)) BETWEEN 11 AND 20
    AND email IS NOT NULL AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 200
    AND phone IS NOT NULL AND length(btrim(phone)) BETWEEN 8 AND 20
  );

DROP POLICY IF EXISTS "public can insert orders" ON public.orders;
CREATE POLICY "public can insert orders"
  ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (
    amount > 0 AND amount <= 100000
    AND status = 'pending'::order_status
    AND (customer_email IS NULL OR (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(customer_email) <= 200))
    AND (customer_name IS NULL OR length(customer_name) <= 200)
    AND (customer_document IS NULL OR length(customer_document) <= 20)
    AND (customer_phone IS NULL OR length(customer_phone) <= 20)
    AND (
      public_link_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.company_links cl
        WHERE cl.id = public_link_id
          AND cl.active = true
          AND (cl.expires_at IS NULL OR cl.expires_at > now())
          AND (orders.company_id IS NULL OR orders.company_id = cl.company_id)
      )
    )
    AND (
      company_id IS NULL
      OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = orders.company_id)
    )
  );

CREATE POLICY "Only admins can insert user_roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin'));

CREATE POLICY "Only admins can update user_roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin'))
  WITH CHECK (private.has_role(auth.uid(),'admin'));

CREATE POLICY "Only admins can delete user_roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'));
