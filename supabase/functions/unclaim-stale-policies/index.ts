import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts'; // Assumes you have a shared CORS file

// Define the threshold (5 hours in milliseconds)
const STALE_THRESHOLD_MS = 5 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Ensure this function is called securely, e.g., via cron secret or internal call
    // If using pg_cron with http_post, verification might be simpler (anon key is okay)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      // IMPORTANT: Use Service Role Key for admin privileges
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const staleTimestamp = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
    console.log(`Querying for policies claimed by a user and last actioned before: ${staleTimestamp}`);

    // Find stale 'Pending' or 'Cannot Locate' policies older than 5 hours
    const { data: stalePolicies, error: queryError } = await supabaseAdmin
      .from('uw_submissions')
      .select('id') // Only need the ID
      .in('status', ['Pending', 'Cannot Locate Policy']) // <-- FIX 1: Look for Pending/CLP
      .is('claimed_by', 'not.null')                   // <-- ADDED: Must be claimed by someone
      .lt('last_action_at', staleTimestamp);           // <-- FIX 2: Check last_action_at

    if (queryError) throw queryError;

    if (!stalePolicies || stalePolicies.length === 0) {
      console.log('No stale policies found.');
      return new Response(JSON.stringify({ message: 'No stale policies found.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    const staleIds = stalePolicies.map(p => p.id);
    console.log(`Found ${staleIds.length} stale policies. Unclaiming...`);

    // Update policies: reset status and claim details
    const { error: updateError } = await supabaseAdmin
      .from('uw_submissions')
      .update({
        status: 'Submitted',
        claimed_by: null,
        claimed_by_email: null,
        claimed_by_first: null,
        claimed_by_last: null,
        claimed_at: null,
        last_action_at: new Date().toISOString(), // Update timestamp
      })
      .in('id', staleIds);

    if (updateError) throw updateError;

    console.log(`Successfully unclaimed ${staleIds.length} policies.`);
    return new Response(JSON.stringify({ message: `Successfully unclaimed ${staleIds.length} policies.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    console.error('Error in unclaim function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});