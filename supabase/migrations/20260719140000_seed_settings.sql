-- Ensure system settings are seeded correctly for the UI
INSERT INTO public.system_settings (key, value)
VALUES 
('aquicnpj_config', '{"base_url": "https://api.aquicnpj.com", "range_query": {}}'::jsonb),
('monitoring_config', '{"active": false, "filters": {"somente_mei": true, "somente_matriz": true, "com_email": true}}'::jsonb),
('site_config', '{"service_value": 97.00, "product_name": "Emissão de Certificado Digital MEI"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
