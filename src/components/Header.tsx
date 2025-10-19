import React, { useState, useEffect } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { getProductByPriceId } from '../stripe-config';

interface HeaderProps {
  currentPage?: string;
  onNavigate?: (page: string) => void;
}

export default function Header({ currentPage = 'home', onNavigate }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [subscription, setSubscription] = useState<any>(null);
  const { user, signOut } = useAuth();

  const navItems = [
    { name: 'Home', key: 'home' },
    { name: 'Features', key: 'features' },
    { name: 'Pricing', key: 'pricing' },
    { name: 'FAQs', key: 'faqs' },
    { name: 'Contact', key: 'contact' },
  ];

  useEffect(() => {
    if (user) {
      fetchSubscription();
    }
  }, [user]);

  const fetchSubscription = async () => {
    try {
      // First get the customer record
      const { data: customerData, error: customerError } = await supabase
        .from('stripe_customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (customerError) {
        console.error('Error fetching customer:', customerError);
        return;
      }

      if (!customerData) {
        // No customer record yet
        return;
      }

      // Then get the subscription
      const { data, error } = await supabase
        .from('stripe_subscriptions')
        .select('*')
        .eq('customer_id', customerData.id)
        .in('status', ['active', 'trialing', 'past_due'])
        .order('created_at', { ascending: false })
        .maybeSingle();

      if (error) {
        console.error('Error fetching subscription:', error);
      } else {
        setSubscription(data);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    }
  };

  const getSubscriptionDisplay = () => {
    if (!subscription?.price_id) return null;
    const product = getProductByPriceId(subscription.price_id);
    return product?.name.replace('Inflow ', '') || 'Active Plan';
  };

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Determine scroll direction
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // Scrolling down and past threshold
        setIsScrolled(true);
      } else if (currentScrollY < lastScrollY || currentScrollY <= 100) {
        // Scrolling up or near top
        setIsScrolled(false);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const handleNavigation = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
    setIsMenuOpen(false);
  };

  const handleAuthAction = () => {
    if (user) {
      // Call signOut and handle any errors
      signOut().catch(error => {
        console.error('Sign out failed:', error);
        // Force redirect even if sign out fails
        window.location.replace('/');
      });
    } else {
      window.location.href = '/login';
    }
  };

  return (
    <>
      {/* Dynamic Island Style Header */}
      <header className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ease-in ${
        isScrolled ? 'opacity-0 -translate-y-24 pointer-events-none' : 'opacity-100 translate-y-0 pointer-events-auto'
      }`}>
        <nav className="bg-white rounded-full px-8 py-3 shadow-2xl border border-gray-100/50 backdrop-blur-sm w-[90vw] max-w-6xl">
          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center justify-between w-full">
            {/* Logo */}
            <div 
              className="flex items-center cursor-pointer"
              onClick={() => handleNavigation('home')}
            >
              <div className="relative h-8 w-[100px]">
                <div className="h-full w-full bg-gradient-to-r from-[#FF4DA6] to-[#7C3AED]"
                  style={{
                    WebkitMaskImage: "url('/dffdf.png')",
                    maskImage: "url('/dffdf.png')",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                  }} />
                <img src="/dffdf.png" alt="Inflow Logo" className="h-full w-auto opacity-0" />
              </div>
            </div>

            {/* Navigation Links */}
            <div className="flex items-center space-x-6 flex-1 justify-center">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => handleNavigation(item.key)}
                  className={`text-sm font-medium transition-colors duration-300 hover:text-pink-600 ${
                    currentPage === item.key ? 'text-pink-600' : 'text-gray-700'
                  }`}
                >
                  {item.name}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3 flex-shrink-0">
              {user ? (
                <div className="flex items-center space-x-3">
                  {getSubscriptionDisplay() && (
                    <span className="text-xs font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                      {getSubscriptionDisplay()}
                    </span>
                  )}
                  <button
                    onClick={handleAuthAction}
                    className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-5 py-2 rounded-full font-medium text-sm transition-all duration-300 shadow-lg hover:shadow-pink-500/25"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => window.location.href = '/login'}
                    className="text-gray-700 hover:text-pink-600 border border-gray-300 hover:border-pink-600 px-5 py-2 rounded-full font-medium text-sm transition-all duration-300"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => window.location.href = '/signup'}
                    className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-5 py-2 rounded-full font-medium text-sm transition-all duration-300 shadow-lg hover:shadow-pink-500/25"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="lg:hidden flex items-center justify-between">
            {/* Mobile Logo */}
            <div 
              className="flex items-center cursor-pointer"
              onClick={() => handleNavigation('home')}
            >
              <div className="relative h-6 w-[80px]">
                <div className="h-full w-full bg-gradient-to-r from-[#FF4DA6] to-[#7C3AED]"
                  style={{
                    WebkitMaskImage: "url('/dffdf.png')",
                    maskImage: "url('/dffdf.png')",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                  }} />
                <img src="/dffdf.png" alt="Inflow Logo" className="h-full w-auto opacity-0" />
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-700 hover:text-pink-600 transition-colors duration-300 p-1"
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </nav>

        {/* Mobile Dropdown Menu */}
        {isMenuOpen && (
          <div className="lg:hidden mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100/50 backdrop-blur-sm p-4">
            <div className="flex flex-col space-y-3">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => handleNavigation(item.key)}
                  className={`text-left text-sm font-medium transition-colors duration-300 hover:text-pink-600 py-2 ${
                    currentPage === item.key ? 'text-pink-600' : 'text-gray-700'
                  }`}
                >
                  {item.name}
                </button>
              ))}
              
              <div className="border-t border-gray-200 pt-3 mt-3">
                {user ? (
                  <div className="space-y-2">
                    {getSubscriptionDisplay() && (
                      <div className="text-center">
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                          {getSubscriptionDisplay()}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={handleAuthAction}
                      className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-4 py-2 rounded-full font-medium text-sm transition-all duration-300 w-full shadow-lg hover:shadow-pink-500/25"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={() => window.location.href = '/login'}
                      className="text-gray-700 hover:text-pink-600 border border-gray-300 hover:border-pink-600 px-4 py-2 rounded-full font-medium text-sm transition-all duration-300 w-full"
                    >
                      Login
                    </button>
                    <button
                      onClick={() => window.location.href = '/signup'}
                      className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-4 py-2 rounded-full font-medium text-sm transition-all duration-300 w-full shadow-lg hover:shadow-pink-500/25"
                    >
                      Sign Up
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}