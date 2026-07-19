import { supabase } from './integrations/supabase/client';

async function seedUser() {
  console.log('Attempting to seed user...');
  const { data, error } = await supabase.auth.signUp({
    email: 'coringa@gmail.com',
    password: '117711',
  });

  if (error) {
    console.error('Error seeding user:', error.message);
  } else {
    console.log('User seeded successfully:', data.user?.id);
  }
}

seedUser();
