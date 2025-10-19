import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!stripeSecret || !stripeWebhookSecret) {
  console.error('Stripe environment variables are not set');
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

Deno.serve(async (req) => {
  try {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { 
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'stripe-signature, content-type',
        }
      });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Check environment variables
    if (!stripeSecret || !stripeWebhookSecret) {
      console.error('Stripe configuration missing');
      return new Response('Stripe configuration missing', { status: 500 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase configuration missing');
      return new Response('Database configuration missing', { status: 500 });
    }

    // Get the signature from the header
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return new Response('No signature found', { status: 400 });
    }

    // Get the raw body
    const body = await req.text();

    // Verify the webhook signature
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
    } catch (error: any) {
      console.error(`Webhook signature verification failed: ${error.message}`);
      return new Response(`Webhook signature verification failed: ${error.message}`, { status: 400 });
    }

    console.log(`Processing webhook event: ${event.type}`);

    // Process the event asynchronously
    EdgeRuntime.waitUntil(handleEvent(event));

    return Response.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function handleEvent(event: Stripe.Event) {
  try {
    const stripeData = event?.data?.object ?? {};

    if (!stripeData || !('customer' in stripeData)) {
      console.log('No customer data in event, skipping');
      return;
    }

    const { customer: customerId } = stripeData;

    if (!customerId || typeof customerId !== 'string') {
      console.error(`Invalid customer ID in event: ${JSON.stringify(event)}`);
      return;
    }

    console.log(`Processing event ${event.type} for customer: ${customerId}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncCustomerFromStripe(customerId);
        break;
      
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        await syncCustomerFromStripe(customerId);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

  } catch (error) {
    console.error('Error handling event:', error);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  try {
    const { customer, mode, payment_status } = session;

    if (!customer || typeof customer !== 'string') {
      console.error('Invalid customer in checkout session');
      return;
    }

    console.log(`Checkout completed for customer ${customer}, mode: ${mode}`);

    if (mode === 'subscription') {
      // For subscriptions, sync the customer data
      await syncCustomerFromStripe(customer);
    } else if (mode === 'payment' && payment_status === 'paid') {
      // For one-time payments, create order record
      const {
        id: checkout_session_id,
        payment_intent,
        amount_subtotal,
        amount_total,
        currency,
      } = session;

      const { error: orderError } = await supabase.from('stripe_orders').insert({
        checkout_session_id,
        payment_intent_id: typeof payment_intent === 'string' ? payment_intent : null,
        customer_id: customer,
        amount: amount_total || 0,
        currency: currency || 'eur',
        status: 'paid',
        purchased_at: new Date().toISOString(),
      });

      if (orderError) {
        console.error('Error creating order record:', orderError);
      } else {
        console.log(`Created order record for session: ${checkout_session_id}`);
      }
    }

  } catch (error) {
    console.error('Error handling checkout completion:', error);
  }
}

async function syncCustomerFromStripe(customerId: string) {
  try {
    console.log(`Syncing customer data for: ${customerId}`);

    // Fetch latest subscription data from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    if (subscriptions.data.length === 0) {
      console.log(`No subscriptions found for customer: ${customerId}`);
      
      // Update subscription status to indicate no active subscription
      const { error: noSubError } = await supabase.from('stripe_subscriptions').upsert(
        {
          customer_id: customerId,
          status: 'canceled',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'customer_id',
        },
      );

      if (noSubError) {
        console.error('Error updating subscription status:', noSubError);
      }
      return;
    }

    // Get the most recent subscription
    const subscription = subscriptions.data[0];

    // Prepare subscription data
    const subscriptionData: any = {
      customer_id: customerId,
      subscription_id: subscription.id,
      price_id: subscription.items.data[0]?.price?.id || null,
      current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
      current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
      trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      status: subscription.status,
      updated_at: new Date().toISOString(),
    };

    // Add payment method info if available
    if (subscription.default_payment_method && typeof subscription.default_payment_method !== 'string') {
      const paymentMethod = subscription.default_payment_method as Stripe.PaymentMethod;
      if (paymentMethod.card) {
        subscriptionData.metadata = {
          payment_method_brand: paymentMethod.card.brand,
          payment_method_last4: paymentMethod.card.last4,
        };
      }
    }

    // Upsert subscription data
    const { error: subError } = await supabase.from('stripe_subscriptions').upsert(
      subscriptionData,
      {
        onConflict: 'customer_id',
      },
    );

    if (subError) {
      console.error('Error syncing subscription:', subError);
      throw new Error('Failed to sync subscription in database');
    }

    console.log(`Successfully synced subscription for customer: ${customerId}`);

  } catch (error) {
    console.error(`Failed to sync subscription for customer ${customerId}:`, error);
    throw error;
  }
}