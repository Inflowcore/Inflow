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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'stripe-signature, content-type',
};

Deno.serve(async (req) => {
  try {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { 
        status: 204,
        headers: corsHeaders
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
    console.log(`Handling event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
        
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
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
    const { customer, mode, payment_status, subscription } = session;

    if (!customer || typeof customer !== 'string') {
      console.error('Invalid customer in checkout session');
      return;
    }

    console.log(`Checkout completed for customer ${customer}, mode: ${mode}`);

    // Get customer record from database
    const { data: customerRecord, error: getCustomerError } = await supabase
      .from('stripe_customers')
      .select('id, user_id')
      .eq('customer_id', customer)
      .single();

    if (getCustomerError || !customerRecord) {
      console.error('Failed to find customer record:', getCustomerError);
      return;
    }

    if (mode === 'subscription' && subscription) {
      // For subscriptions, the subscription.created event will handle the database update
      console.log(`Subscription checkout completed: ${subscription}`);
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
        customer_id: customerRecord.id,
        checkout_session_id,
        payment_intent_id: typeof payment_intent === 'string' ? payment_intent : null,
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

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  try {
    console.log(`Subscription created: ${subscription.id}`);
    await upsertSubscription(subscription);
  } catch (error) {
    console.error('Error handling subscription created:', error);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  try {
    console.log(`Subscription updated: ${subscription.id}`);
    await upsertSubscription(subscription);
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    console.log(`Subscription deleted: ${subscription.id}`);
    
    // Mark subscription as deleted
    const { error } = await supabase
      .from('stripe_subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('subscription_id', subscription.id);

    if (error) {
      console.error('Error marking subscription as deleted:', error);
    } else {
      console.log(`Marked subscription ${subscription.id} as canceled`);
    }
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  try {
    console.log(`Invoice payment succeeded: ${invoice.id}`);
    
    if (invoice.subscription && typeof invoice.subscription === 'string') {
      // Update subscription status if needed
      const { error } = await supabase
        .from('stripe_subscriptions')
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('subscription_id', invoice.subscription)
        .eq('status', 'past_due');

      if (error) {
        console.error('Error updating subscription after successful payment:', error);
      }
    }
  } catch (error) {
    console.error('Error handling invoice payment succeeded:', error);
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  try {
    console.log(`Invoice payment failed: ${invoice.id}`);
    
    if (invoice.subscription && typeof invoice.subscription === 'string') {
      // Update subscription status to past_due
      const { error } = await supabase
        .from('stripe_subscriptions')
        .update({
          status: 'past_due',
          updated_at: new Date().toISOString(),
        })
        .eq('subscription_id', invoice.subscription);

      if (error) {
        console.error('Error updating subscription after failed payment:', error);
      }
    }
  } catch (error) {
    console.error('Error handling invoice payment failed:', error);
  }
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string;
    
    // Get customer record from database
    const { data: customerRecord, error: getCustomerError } = await supabase
      .from('stripe_customers')
      .select('id, user_id')
      .eq('customer_id', customerId)
      .single();

    if (getCustomerError || !customerRecord) {
      console.error('Failed to find customer record for subscription:', getCustomerError);
      return;
    }

    // Prepare subscription data
    const subscriptionData = {
      customer_id: customerRecord.id,
      subscription_id: subscription.id,
      price_id: subscription.items.data[0]?.price?.id || null,
      status: subscription.status as any,
      current_period_start: subscription.current_period_start 
        ? new Date(subscription.current_period_start * 1000).toISOString() 
        : null,
      current_period_end: subscription.current_period_end 
        ? new Date(subscription.current_period_end * 1000).toISOString() 
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at 
        ? new Date(subscription.canceled_at * 1000).toISOString() 
        : null,
      trial_start: subscription.trial_start 
        ? new Date(subscription.trial_start * 1000).toISOString() 
        : null,
      trial_end: subscription.trial_end 
        ? new Date(subscription.trial_end * 1000).toISOString() 
        : null,
      metadata: subscription.metadata || {},
      updated_at: new Date().toISOString(),
    };

    // Upsert subscription data
    const { error: upsertError } = await supabase
      .from('stripe_subscriptions')
      .upsert(subscriptionData, {
        onConflict: 'subscription_id',
      });

    if (upsertError) {
      console.error('Error upserting subscription:', upsertError);
      throw new Error('Failed to sync subscription in database');
    }

    console.log(`Successfully synced subscription: ${subscription.id}`);

  } catch (error) {
    console.error(`Failed to upsert subscription ${subscription.id}:`, error);
    throw error;
  }
}