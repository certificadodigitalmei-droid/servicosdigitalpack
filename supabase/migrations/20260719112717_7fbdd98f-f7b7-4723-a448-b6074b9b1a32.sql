-- Check permissions for the service_role and authenticated users on relevant tables
SELECT 
    grantee, 
    table_name, 
    privilege_type
FROM 
    information_schema.role_table_grants 
WHERE 
    table_name IN ('link_generations', 'company_links')
    AND grantee IN ('authenticated', 'service_role');

-- Check RLS policies for these tables
SELECT 
    tablename, 
    policyname, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM 
    pg_policies 
WHERE 
    tablename IN ('link_generations', 'company_links');

-- Check if the columns exist as expected
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'link_generations';
