import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, payload } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    const { data: { user } } = await supabaseAdmin.auth.getUser(req.headers.get('Authorization')!.replace('Bearer ', ''))
    if (user?.user_metadata?.role !== 'admin') {
      throw new Error("Permission denied: User is not an admin.");
    }

    let responseData;

    switch (action) {
      case 'list_users':
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;
        responseData = users;
        break;

      case 'create_user':
        const { email, password, role, name, region } = payload;
        const { data: { user: newUser }, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { role, full_name: name, region }
        });
        if (createError) throw createError;
        responseData = { message: `Successfully created user: ${newUser.email}` };
        break;

      case 'send_password_reset':
        const { email: resetEmail } = payload;
        const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(resetEmail, {
            redirectTo: `${Deno.env.get('SITE_URL')}/reset-password`,
        });
        if (resetError) throw resetError;
        responseData = { message: `Password reset link sent to ${resetEmail}` };
        break;

      // ✅ ADD THIS NEW CASE FOR DELETING A USER
      case 'delete_user':
        const { userId, userEmail } = payload;
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteError) throw deleteError;
        responseData = { message: `Successfully deleted user: ${userEmail}` };
        break;

      default:
        throw new Error("Invalid action specified.");
    }
    
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
