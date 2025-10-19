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

// Helper function to create responses with CORS headers
function corsResponse(body: string | object | null, status = 200) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // For 204 No Content, don't include Content-Type or body
  if (status === 204) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    // Check if required environment variables are available
    if (!stripeSecret) {
      console.error('STRIPE_SECRET_KEY is missing');
      return corsResponse({ error: 'Stripe configuration missing' }, 500);
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase configuration missing');
      return corsResponse({ error: 'Database configuration missing' }, 500);
    }

    const { price_id, success_url, cancel_url, mode } = await req.json();

    // Validate required parameters
    if (!price_id || !success_url || !cancel_url || !mode) {
      return corsResponse({ 
        error: 'Missing required parameters: price_id, success_url, cancel_url, mode' 
      }, 400);
    }

    if (mode !== 'subscription' && mode !== 'payment') {
      return corsResponse({ 
        error: 'Invalid mode. Must be "subscription" or "payment"' 
      }, 400);
    }

    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return corsResponse({ error: 'Authorization header missing' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser(token);

    if (getUserError) {
      console.error('Failed to authenticate user:', getUserError);
      return corsResponse({ error: 'Failed to authenticate user' }, 401);
    }

    if (!user) {
      return corsResponse({ error: 'User not found' }, 404);
    }

    console.log(`Processing checkout for user: ${user.id}, price: ${price_id}`);

    // Check if customer already exists
    const { data: existingCustomer, error: getCustomerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (getCustomerError) {
      console.error('Failed to fetch customer information:', getCustomerError);
      return corsResponse({ error: 'Failed to fetch customer information' }, 500);
    }

    let customerId: string;

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
        const { error: createCustomerError } = await supabase.from('stripe_customers').insert({
          user_id: user.id,
          customer_id: newCustomer.id,
        });

        if (createCustomerError) {
          console.error('Failed to save customer information:', createCustomerError);
          
          // Clean up Stripe customer if database insert fails
          try {
            await stripe.customers.del(newCustomer.id);
          } catch (deleteError) {
            console.error('Failed to clean up Stripe customer:', deleteError);
          }

          return corsResponse({ error: 'Failed to create customer mapping' }, 500);
        }

        customerId = newCustomer.id;

        // Create subscription record for subscription mode
        if (mode === 'subscription') {
          const { error: createSubscriptionError } = await supabase.from('stripe_subscriptions').insert({
            customer_id: customerId,
            status: 'not_started',
          });

          if (createSubscriptionError) {
            console.error('Failed to create subscription record:', createSubscriptionError);
            
            // Clean up customer if subscription creation fails
            try {
              await stripe.customers.del(customerId);
              await supabase.from('stripe_customers').delete().eq('customer_id', customerId);
            } catch (cleanupError) {
              console.error('Failed to clean up after subscription creation error:', cleanupError);
            }

            return corsResponse({ error: 'Failed to create subscription record' }, 500);
          }
        }

      } catch (stripeError) {
        console.error('Failed to create Stripe customer:', stripeError);
        return corsResponse({ error: 'Failed to create customer' }, 500);
      }
    } else {
      customerId = existingCustomer.customer_id;

      // For subscription mode, ensure subscription record exists
      if (mode === 'subscription') {
        const { data: existingSubscription, error: getSubscriptionError } = await supabase
          .from('stripe_subscriptions')
          .select('status')
          .eq('customer_id', customerId)
          .maybeSingle();

        if (getSubscriptionError) {
          console.error('Failed to fetch subscription information:', getSubscriptionError);
          return corsResponse({ error: 'Failed to fetch subscription information' }, 500);
        }

        if (!existingSubscription) {
          // Create subscription record for existing customer
          const { error: createSubscriptionError } = await supabase.from('stripe_subscriptions').insert({
            customer_id: customerId,
            status: 'not_started',
          });

          if (createSubscriptionError) {
            console.error('Failed to create subscription record for existing customer:', createSubscriptionError);
            return corsResponse({ error: 'Failed to create subscription record' }, 500);
          }
        }
      }
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
      };

      // Add trial period for subscriptions
      if (mode === 'subscription') {
        sessionParams.subscription_data = {
          trial_period_days: 7,
        };
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      console.log(`Created checkout session ${session.id} for customer ${customerId}`);

      return corsResponse({ 
        sessionId: session.id, 
        url: session.url,
        customer_id: customerId 
      });

    } catch (stripeError) {
      console.error('Failed to create checkout session:', stripeError);
      return corsResponse({ error: 'Failed to create checkout session' }, 500);
    }

  } catch (error: any) {
    console.error('Checkout error:', error);
    return corsResponse({ error: error.message || 'Internal server error' }, 500);
  }
});