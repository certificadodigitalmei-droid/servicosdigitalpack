UPDATE public.company_links 
SET 
  public_url = REPLACE(public_url, 'https://certificadodigitalccmei.online', 'https://seu-certificado-mei-digital.online'),
  checkout_url = REPLACE(checkout_url, 'https://certificadodigitalccmei.online', 'https://seu-certificado-mei-digital.online')
WHERE 
  public_url LIKE 'https://certificadodigitalccmei.online%' 
  OR checkout_url LIKE 'https://certificadodigitalccmei.online%';