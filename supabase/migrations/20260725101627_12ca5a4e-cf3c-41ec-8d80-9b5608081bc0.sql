CREATE POLICY "Admins can delete orders" ON public.orders
FOR DELETE
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role));