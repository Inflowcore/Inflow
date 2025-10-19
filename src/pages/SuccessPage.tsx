import React, { useEffect, useState } from 'react';
import { CircleCheck as CheckCircle, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { getProductByPriceId } from '../stripe-config';

export default function SuccessPage() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchSubscription();
    }
  }, [user]);

  const fetchSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from('stripe_user_subscriptions')
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('Error fetching subscription:', error);
      } else {
        setSubscription(data);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProductName = () => {
    if (!subscription?.price_id) return 'Your Plan';
    const product = getProductByPriceId(subscription.price_id);
    return product?.name || 'Your Plan';
  };

  const handleGoToDashboard = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Success Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-green-50 via-white to-blue-50">
        {/* Premium Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Main gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-green-100/30 via-transparent to-blue-100/30"></div>
          
          {/* Floating gradient shapes */}
          <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-r from-green-400/20 to-blue-400/20 rounded-full mix-blend-multiply filter blur-3xl animate-float opacity-70"></div>
          <div className="absolute top-40 right-10 w-80 h-80 bg-gradient-to-r from-blue-400/20 to-green-400/20 rounded-full mix-blend-multiply filter blur-3xl animate-float opacity-70" style={{ animationDelay: '2s' }}></div>
          
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%2310B981%22%20fill-opacity%3D%220.02%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%221%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50"></div>
        </div>
        
        <div className="relative z-10 container mx-auto px-6 text-center">
          <div className="max-w-4xl mx-auto">
            {/* Success Icon */}
            <div className="flex justify-center mb-8">
              <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-2xl animate-bounce">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
            </div>

            <h1 className="text-4xl md:text-6xl font-black mb-6 text-gray-900 leading-tight tracking-tight">
              Welcome to Inflow!
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed font-light">
              Your subscription has been successfully activated. You're now ready to transform your business operations.
            </p>

            {loading ? (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-100 shadow-lg mb-8 max-w-md mx-auto">
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-gray-600">Loading subscription details...</span>
                </div>
              </div>
            ) : subscription ? (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-100 shadow-lg mb-8 max-w-md mx-auto">
                <div className="flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-green-500 mr-2" />
                  <h3 className="text-xl font-bold text-gray-900">Subscription Active</h3>
                </div>
                <p className="text-gray-600 mb-2">
                  <span className="font-semibold">Plan:</span> {getProductName()}
                </p>
                <p className="text-gray-600">
                  <span className="font-semibold">Status:</span> {subscription.subscription_status === 'active' ? 'Active' : subscription.subscription_status}
                </p>
              </div>
            ) : (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-100 shadow-lg mb-8 max-w-md mx-auto">
                <p className="text-gray-600">
                  Your payment was successful! Your subscription details will be available shortly.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button 
                onClick={handleGoToDashboard}
                className="group bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-white px-10 py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-green-500/25 flex items-center space-x-2"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Next Steps */}
            <div className="mt-16 max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">What's Next?</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-100 shadow-sm">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <span className="text-white font-bold">1</span>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">Set Up Your Profile</h3>
                  <p className="text-gray-600 text-sm">Complete your business profile and customize your dashboard.</p>
                </div>
                
                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-100 shadow-sm">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <span className="text-white font-bold">2</span>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">Import Your Data</h3>
                  <p className="text-gray-600 text-sm">Bring in your existing contacts and business information.</p>
                </div>
                
                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-100 shadow-sm">
                  <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-red-600 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <span className="text-white font-bold">3</span>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">Start Growing</h3>
                  <p className="text-gray-600 text-sm">Begin using Inflow's powerful tools to grow your business.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}