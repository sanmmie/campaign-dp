import React from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store';
import { Button } from '../components/ui/Button';

export function Landing() {
  const { user } = useAuthStore();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-primary to-brand-secondary text-white">
        {/* Background image with overlay for readability */}
        <div aria-hidden="true" className="absolute inset-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1920&q=80')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/85 via-brand-primary/70 to-brand-secondary/85" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Create Campaign Materials in Minutes
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-8">
              Generate professional political campaign graphics with AI-powered templates,
              photo editing, and instant sharing to WhatsApp, Facebook, X, and Telegram.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              {user ? (
                <Link to="/dashboard">
                  <Button size="lg" variant="accent" className="w-full sm:w-auto">
                    Go to Dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/signup">
                    <Button size="lg" variant="accent" className="w-full sm:w-auto">
                                      Get Started Free
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button size="lg" variant="ghost" className="w-full sm:w-auto bg-white/10 text-white hover:bg-white/20">
                      Sign In
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need for Campaign Design
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From template selection to final export, we&apos;ve got you covered.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon="🎨"
              title="Template Editor"
              description="Drag-and-drop editor with layers, text, shapes, and photo zones. Customize every detail."
            />
            <FeatureCard
              icon="📸"
              title="Photo Processing"
              description="Auto-strip EXIF, resize, crop, and apply masks. Support for circular, rounded, and free-form photo zones."
            />
            <FeatureCard
              icon="⚡"
              title="Instant Export"
              description="Export to Instagram, WhatsApp, Facebook, X, or print-ready A4. Multiple presets available."
            />
            <FeatureCard
              icon="📤"
              title="Easy Sharing"
              description="One-click sharing to WhatsApp, Facebook, X, and Telegram with pre-filled messages."
            />
            <FeatureCard
              icon="🛡️"
              title="Authorization"
              description="Campaign authorization system with authorized-by attribution and disclaimer enforcement."
            />
            <FeatureCard
              icon="🌍"
              title="Nigerian Languages"
              description="Support for Yoruba, Hausa, and Igbo with proper font rendering and unicode ranges."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-secondary to-brand-primary text-white py-20">
        {/* Background image with overlay for readability */}
        <div aria-hidden="true" className="absolute inset-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1920&q=80')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-brand-secondary/85 to-brand-primary/85" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Start Creating?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join thousands of campaign organizers creating professional materials.
          </p>
          <Link to="/signup">
            <Button size="lg" variant="accent">
              Create Free Account
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}