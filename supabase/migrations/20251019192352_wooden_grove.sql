/*
  # Complete Stripe Integration Schema

  1. New Tables
    - `stripe_customers` - Maps Supabase users to Stripe customers
    - `stripe_subscriptions` - Stores subscription data from Stripe
    - `stripe_orders` - Stores one-time payment data from Stripe

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to access their own data
    - Proper foreign key relationships

  3. Indexes
    - Performance indexes on frequently queried columns
    - Unique constraints where needed
*/

-- Create custom types for subscription and order status
CREATE TYPE subscription_status AS ENUM (
  'incomplete',
  'incomplete_expired', 
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid'
);

CREATE TYPE order_status AS ENUM (
  'pending',
  'paid',
  'failed',
  'refunded'
);

-- Stripe Customers Table
CREATE TABLE IF NOT EXISTS stripe_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id text UNIQUE NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Stripe Subscriptions Table  
CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES stripe_customers(id) ON DELETE CASCADE,
  subscription_id text UNIQUE NOT NULL,
  status subscription_status DEFAULT 'trialing',
  price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  canceled_at timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Stripe Orders Table (for one-time payments)
CREATE TABLE IF NOT EXISTS stripe_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES stripe_customers(id) ON DELETE SET NULL,
  order_id text UNIQUE,
  checkout_session_id text UNIQUE,
  payment_intent_id text UNIQUE,
  amount integer NOT NULL,
  currency text DEFAULT 'eur',
  status order_status DEFAULT 'pending',
  metadata jsonb DEFAULT '{}',
  purchased_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS stripe_customers_user_id_idx ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS stripe_customers_customer_id_idx ON stripe_customers(customer_id);

CREATE INDEX IF NOT EXISTS stripe_subscriptions_customer_id_idx ON stripe_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS stripe_subscriptions_status_idx ON stripe_subscriptions(status);

CREATE INDEX IF NOT EXISTS stripe_orders_customer_id_idx ON stripe_orders(customer_id);
CREATE INDEX IF NOT EXISTS stripe_orders_status_idx ON stripe_orders(status);

-- Enable Row Level Security
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for stripe_customers
CREATE POLICY "Stripe customers: owner select" ON stripe_customers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Stripe customers: owner insert" ON stripe_customers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Stripe customers: owner update" ON stripe_customers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Stripe customers: owner delete" ON stripe_customers
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for stripe_subscriptions
CREATE POLICY "Stripe subscriptions: owner access" ON stripe_subscriptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stripe_customers sc 
      WHERE sc.id = stripe_subscriptions.customer_id 
      AND sc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stripe_customers sc 
      WHERE sc.id = stripe_subscriptions.customer_id 
      AND sc.user_id = auth.uid()
    )
  );

-- RLS Policies for stripe_orders
CREATE POLICY "Stripe orders: owner access" ON stripe_orders
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stripe_customers sc 
      WHERE sc.id = stripe_orders.customer_id 
      AND sc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stripe_customers sc 
      WHERE sc.id = stripe_orders.customer_id 
      AND sc.user_id = auth.uid()
    )
  );

-- Create helpful views for easier querying
CREATE OR REPLACE VIEW stripe_user_subscriptions AS
SELECT 
  s.id as subscription_record_id,
  s.customer_id,
  sc.user_id,
  s.subscription_id as stripe_subscription_id,
  s.status,
  s.price_id,
  s.current_period_start,
  s.current_period_end,
  s.cancel_at_period_end,
  s.canceled_at,
  s.trial_start,
  s.trial_end,
  s.metadata,
  s.created_at,
  s.updated_at
FROM stripe_subscriptions s
JOIN stripe_customers sc ON sc.id = s.customer_id;

CREATE OR REPLACE VIEW stripe_user_orders AS
SELECT 
  o.id as order_record_id,
  o.customer_id,
  sc.user_id,
  o.order_id as stripe_order_id,
  o.checkout_session_id,
  o.payment_intent_id,
  o.amount,
  o.currency,
  o.status,
  o.metadata,
  o.purchased_at,
  o.created_at,
  o.updated_at
FROM stripe_orders o
JOIN stripe_customers sc ON sc.id = o.customer_id;

-- Function to get user's active subscription
CREATE OR REPLACE FUNCTION get_user_active_subscription(user_uuid uuid)
RETURNS TABLE (
  subscription_id text,
  status subscription_status,
  price_id text,
  current_period_end timestamptz,
  trial_end timestamptz
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    s.subscription_id,
    s.status,
    s.price_id,
    s.current_period_end,
    s.trial_end
  FROM stripe_subscriptions s
  JOIN stripe_customers sc ON sc.id = s.customer_id
  WHERE sc.user_id = user_uuid
    AND s.status IN ('active', 'trialing', 'past_due')
    AND s.deleted_at IS NULL
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;