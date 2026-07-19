-- Check GRANTS for public schema objects
SELECT 
    grantee, 
    table_name, 
    privilege_type
FROM 
    information_schema.role_table_grants 
WHERE 
    table_name IN ('link_generations', 'company_links')
    AND grantee IN ('authenticated', 'service_role', 'anon');

-- Check table ownership
SELECT tablename, tableowner FROM pg_tables WHERE tablename IN ('link_generations', 'company_links');
