DROP POLICY IF EXISTS "team reads job runs" ON public.job_runs;
DROP POLICY IF EXISTS "team reads attributions" ON public.purchase_attributions;
CREATE POLICY "admins read job runs" ON public.job_runs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins read attributions" ON public.purchase_attributions FOR SELECT TO authenticated USING (public.is_admin());