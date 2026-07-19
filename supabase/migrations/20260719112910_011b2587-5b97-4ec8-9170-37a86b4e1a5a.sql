-- Inspect current RLS policies for link_generations
SELECT 
    policyname, 
    cmd, 
    roles, 
    qual, 
    with_check 
FROM pg_policies 
WHERE tablename = 'link_generations';

-- Check if RLS is truly enabled
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'link_generations';

-- Check current user and roles (for debugging)
-- Since I'm running this in migration, I can't check the web user's session directly,
-- but I can check the grants.
