export interface StripeProduct {
  id: string;
  priceId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  currencySymbol: string;
  mode: 'payment' | 'subscription';
  features: string[];
}

export const stripeProducts: StripeProduct[] = [
  {
    id: 'prod_standard',
    priceId: 'price_standard_monthly', // Replace with your actual Stripe price ID
    name: 'Inflow Standard Plan',
    description: 'All the Tools to Capture More Leads, Nurture & Close Leads into Customers, Full Online Booking, Pipelines, Social Cal, Website Builder, and More!',
    price: 59.99,
    currency: 'eur',
    currencySymbol: '€',
    mode: 'subscription',
    features: [
      'All the Tools to Capture More Leads',
      'Nurture & Close Leads into Customers',
      'Full Online Booking, Pipelines, Social Cal, Website Builder, and More!',
      'Unlimited Contacts & Users, Add as Many Contacts & Users as You Need!',
      'Setup Up To Three Sub-Accounts',
      '7-day free trial'
    ]
  },
  {
    id: 'prod_premium',
    priceId: 'price_premium_monthly', // Replace with your actual Stripe price ID
    name: 'Inflow Premium Plan',
    description: 'Everything In Standard Plan, Api Access - Integrate with Anything, Unlimited Sub-Accounts - As Many Client Accounts as You Need for One Price!',
    price: 74.99,
    currency: 'eur',
    currencySymbol: '€',
    mode: 'subscription',
    features: [
      'Everything In Standard Plan',
      'Api Access - Integrate with Anything',
      'Unlimited Sub-Accounts - As Many Client Accounts as You Need for One Price!',
      'A Complete Control Over the Looks and Feel of the Platform!',
      'Priority Support',
      '7-day free trial'
    ]
  }
];

export function getProductByPriceId(priceId: string): StripeProduct | undefined {
  return stripeProducts.find(product => product.priceId === priceId);
}

export function getProductById(id: string): StripeProduct | undefined {
  return stripeProducts.find(product => product.id === id);
}

export function getStandardPlan(): StripeProduct | undefined {
  return stripeProducts.find(product => product.name === 'Inflow Standard Plan');
}

export function getPremiumPlan(): StripeProduct | undefined {
  return stripeProducts.find(product => product.name === 'Inflow Premium Plan');
}