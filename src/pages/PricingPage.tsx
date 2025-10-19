import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { getStandardPlan, getPremiumPlan } from '../stripe-config';
import { Check, Zap, Crown, Sparkles, Loader as Loader2 } from 'lucide-react';

export default function PricingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string>('');

  const standardPlan = getStandardPlan();
  const premiumPlan = getPremiumPlan();

  const handleStartFreeTrial = async (priceId: string, planName: string) => {
    if (!priceId) {
      setError('Invalid plan configuration. Please contact support.');
      return;
    }

    if (!user) {
      window.location.href = '/login';
      return;
    }

    setLoading(priceId);
    setError('');

    try {
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('Session error:', sessionError);
        window.location.href = '/login';
        return;
      }

      // Create checkout session
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase configuration missing');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          price_id: priceId,
          success_url: `${window.location.origin}/success`,
          cancel_url: `${window.location.origin}/#pricing`,
          mode: 'subscription'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Checkout response error:', response.status, errorText);
        throw new Error(`Failed to create checkout session: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.url) {
        // Redirect to Stripe checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }

    } catch (error) {
      console.error('Checkout error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start checkout';
      setError(`Failed to start checkout for ${planName}. ${errorMessage}`);
    } finally {
      setLoading(null);
    }
  };

  if (!standardPlan || !premiumPlan) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Configuration Error</h2>
          <p className="text-gray-600">Pricing plans are not properly configured. Please contact support.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-center justify-center overflow-hidden pt-24 bg-gradient-to-br from-pink-50 via-white to-purple-50">
        {/* Premium Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Main gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-pink-100/30 via-transparent to-purple-100/30"></div>
          
          {/* Floating gradient shapes */}
          <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-r from-pink-400/20 to-purple-400/20 rounded-full mix-blend-multiply filter blur-3xl animate-float opacity-70"></div>
          <div className="absolute top-40 right-10 w-80 h-80 bg-gradient-to-r from-purple-400/20 to-cyan-400/20 rounded-full mix-blend-multiply filter blur-3xl animate-float opacity-70" style={{ animationDelay: '2s' }}></div>
          
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23FF4DA6%22%20fill-opacity%3D%220.02%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%221%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50"></div>
        </div>
        
        <div className="relative z-10 container mx-auto px-6 text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-black mb-6 text-gray-900 leading-tight tracking-tight">
              Choose Your Plan
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto font-light">
              Scale your business with the right plan for your needs. All plans include a 7-day free trial.
            </p>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-6 py-20">
        {/* Error Message */}
        {error && (
          <div className="max-w-5xl mx-auto mb-8">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700">
              <p className="font-medium">Payment Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Standard Plan */}
          <div className="bg-white rounded-3xl p-8 border border-gray-100 relative shadow-lg hover:shadow-xl transition-all duration-300 hover-lift">
            <div className="flex items-center mb-6">
              <Zap className="w-6 h-6 text-pink-500 mr-3" />
              <h2 className="text-3xl font-bold text-gray-900">Standard Plan</h2>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline mb-2">
                <span className="text-5xl font-black text-gray-900">{standardPlan.currencySymbol}{standardPlan.price}</span>
                <span className="text-gray-600 ml-2">/month</span>
              </div>
              <p className="text-gray-600 text-sm">{standardPlan.description}</p>
            </div>

            <ul className="space-y-4 mb-8">
              {standardPlan.features.map((feature, index) => (
                <li key={index} className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleStartFreeTrial(standardPlan.priceId, standardPlan.name)}
              disabled={loading === standardPlan.priceId}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-pink-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
            >
              {loading === standardPlan.priceId ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                'Start Free Trial'
              )}
            </button>
          </div>

          {/* Premium Plan */}
          <div className="bg-white rounded-3xl p-8 border-2 border-pink-200 relative shadow-xl hover:shadow-2xl transition-all duration-300 hover-lift">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <span className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                Most Popular
              </span>
            </div>

            <div className="flex items-center mb-6">
              <Crown className="w-6 h-6 text-purple-600 mr-3" />
              <h2 className="text-3xl font-bold text-gray-900">Premium Plan</h2>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline mb-2">
                <span className="text-5xl font-black text-gray-900">{premiumPlan.currencySymbol}{premiumPlan.price}</span>
                <span className="text-gray-600 ml-2">/month</span>
              </div>
              <p className="text-gray-600 text-sm">{premiumPlan.description}</p>
            </div>

            <ul className="space-y-4 mb-8">
              {premiumPlan.features.map((feature, index) => (
                <li key={index} className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleStartFreeTrial(premiumPlan.priceId, premiumPlan.name)}
              disabled={loading === premiumPlan.priceId}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-pink-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
            >
              {loading === premiumPlan.priceId ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                'Start Free Trial'
              )}
            </button>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12 bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 hover-lift">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Can I cancel anytime?</h3>
              <p className="text-gray-600">
                Yes, you can cancel your subscription at any time. Your access will continue until the end of your current billing period, and you won't be charged again.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 hover-lift">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Is my data secure?</h3>
              <p className="text-gray-600">
                Absolutely. We use enterprise-grade security measures including SSL encryption, regular backups, and strict access controls to protect your business data.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 hover-lift">
              <h3 className="text-xl font-bold text-gray-900 mb-3">How easy is it to get started?</h3>
              <p className="text-gray-600">
                Very easy! Our onboarding process takes just minutes, and our intuitive interface means you can start managing clients right away. Plus, our support team is here to help.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}