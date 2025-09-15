// migrateUsers.js
const fs = require('fs');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

// Your Supabase URL and secret Service Role Key are now included.
const supabaseUrl = 'https://vmvloywqpvbmuygnnivs.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtdmxveXdxcHZibXV5Z25uaXZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjE3MDM1MSwiZXhwIjoyMDcxNzQ2MzUxfQ.ACq6x7J9qn5YAg2ts6EE422CCGXbTcv4KATybWwA7dU';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

console.log('Starting user migration...');

fs.createReadStream('users.csv')
  .pipe(csv())
  .on('data', async (row) => {
    const { email, password, role, name, region } = row;

    if (!email || !password) {
        console.error('Skipping row due to missing email or password:', row);
        return;
    }

    console.log(`Attempting to create user: ${email}`);

    const { data, error } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
            role: role || 'agent',
            full_name: name,
            region: region
        }
    });

    if (error) {
        console.error(`Failed to create user ${email}:`, error.message);
    } else {
        const meta = data.user.user_metadata;
        console.log(`✅ Successfully created user: ${data.user.email} (Name: ${meta.full_name}, Role: ${meta.role}, Region: ${meta.region})`);
    }
  })
  .on('end', () => {
    console.log('CSV file successfully processed. Migration finished.');
  });