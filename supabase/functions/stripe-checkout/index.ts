import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!stripeSecret) {
  console.error('STRIPE_SECRET_KEY is not set');
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase environment variables are not set');
}

const stripe = new Stripe(stripeSecret || '', {
  appInfo: {
    name: 'Inflow Integration',
    version: '1.0.0',
  },
});

const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { 
        status: 204,
        headers: corsHeaders
      });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check environment variables
    if (!stripeSecret) {
      console.error('STRIPE_SECRET_KEY is missing');
      return new Response(JSON.stringify({ error: 'Stripe configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase configuration missing');
      return new Response(JSON.stringify({ error: 'Database configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { price_id, success_url, cancel_url, mode = 'subscription' } = await req.json();

    // Validate required parameters
    if (!price_id || !success_url || !cancel_url) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters: price_id, success_url, cancel_url' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode !== 'subscription' && mode !== 'payment') {
      return new Response(JSON.stringify({ 
        error: 'Invalid mode. Must be "subscription" or "payment"' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header missing' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser(token);

    if (getUserError) {
      console.error('Failed to authenticate user:', getUserError);
      return new Response(JSON.stringify({ error: 'Failed to authenticate user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing checkout for user: ${user.id}, price: ${price_id}`);

    // Check if customer already exists
    const { data: existingCustomer, error: getCustomerError } = await supabase
      .from('stripe_customers')
      .select('id, customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (getCustomerError) {
      console.error('Failed to fetch customer information:', getCustomerError);
      return new Response(JSON.stringify({ error: 'Failed to fetch customer information' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let customerId: string;
    let customerRecordId: string;

    if (!existingCustomer || !existingCustomer.customer_id) {
      // Create new Stripe customer
      try {
        const newCustomer = await stripe.customers.create({
          email: user.email,
          metadata: {
            userId: user.id,
          },
        });

        console.log(`Created new Stripe customer ${newCustomer.id} for user ${user.id}`);

        // Save customer mapping to database
        const { data: customerRecord, error: createCustomerError } = await supabase
          .from('stripe_customers')
          .insert({
            user_id: user.id,
            customer_id: newCustomer.id,
          })
          .select('id, customer_id')
          .single();

        if (createCustomerError || !customerRecord) {
          console.error('Failed to save customer information:', createCustomerError);
          
          // Clean up Stripe customer if database insert fails
          try {
            await stripe.customers.del(newCustomer.id);
          } catch (deleteError) {
            console.error('Failed to clean up Stripe customer:', deleteError);
          }

          return new Response(JSON.stringify({ error: 'Failed to create customer mapping' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        customerId = newCustomer.id;
        customerRecordId = customerRecord.id;

      } catch (stripeError) {
        console.error('Failed to create Stripe customer:', stripeError);
        return new Response(JSON.stringify({ error: 'Failed to create customer' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      customerId = existingCustomer.customer_id;
      customerRecordId = existingCustomer.id;
    }

    // Create Stripe checkout session
    try {
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: price_id,
            quantity: 1,
          },
        ],
        mode: mode as 'subscription' | 'payment',
        success_url,
        cancel_url,
        metadata: {
          user_id: user.id,
          customer_record_id: customerRecordId,
        },
      };

      // Add trial period for subscriptions
      if (mode === 'subscription') {
        sessionParams.subscription_data = {
          trial_period_days: 7,
          metadata: {
            user_id: user.id,
            customer_record_id: customerRecordId,
          },
        };
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      console.log(`Created checkout session ${session.id} for customer ${customerId}`);

      return new Response(JSON.stringify({ 
        sessionId: session.id, 
        url: session.url,
        customer_id: customerId 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (stripeError) {
      console.error('Failed to create checkout session:', stripeError);
      return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: any) {
    console.error('Checkout error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});