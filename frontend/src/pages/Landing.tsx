import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store';
import { Button } from '../components/ui/Button';
import { useAuthBootstrap } from '../hooks/useAuthBootstrap';

export function Landing() {
  const { user } = useAuthStore();
  const { ready } = useAuthBootstrap();

  useEffect(() => {
    // No-op; useAuthBootstrap runs on mount via its own useEffect.
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-brand-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-primary via-brand-primary/90 to-brand-secondary text-white">
        <div aria-hidden="true" className="absolute inset-0">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22><path fill=%22%23ffffff%22 fill-opacity=%220.08%22 d=%22M10 10h5v5H10zM30 10h5v5H30zM50 10h5v5H50zM70 10h5v5H70zM90 10h5v5H90zM10 30h5v5H10zM30 30h5v5H30zM50 30h5v5H50zM70 30h5v5H70zM90 30h5v5H90zM10 50h5v5H10zM30 50h5v5H30zM50 50h5v5H50zM70 50h5v5H70zM90 50h5v5H90zM10 70h5v5H10zM30 70h5v5H30zM50 70h5v5H50zM70 70h5v5H70zM90 70h5v5H90zM10 90h5v5H10zM30 90h5v5H30zM50 90h5v5H50zM70 90h5v5H70zM90 90h5v5H90z/%22></svg>')] opacity-40" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="max-w-2xl lg:max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 border border-white/30 text-sm font-medium text-white mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              <span>Live in Nigeria</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-6 leading-tight">
              Create campaign materials<br />
              <span className="text-brand-accent">in minutes</span>
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 max-w-xl">
              Generate professional political campaign graphics with photo editing,
              template customization, and instant sharing to WhatsApp, Facebook,
              X, and Telegram. No design skills required.
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
                  <Link to="/templates">
                    <Button size="lg" variant="accent" className="w-full sm:w-auto">
                      Start Creating (No Account Required)
                    </Button>
                  </Link>
                  <div className="flex items-center gap-2 text-sm text-white/80">
                    Already have an account?{' '}
                    <Link
                      to="/login"
                      className="text-white underline underline-offset-2 hover:text-brand-accent"
                    >
                      Sign In
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              How it works
            </h2>
            <p className="text-gray-600">
              From opening the app to sharing your design in three steps.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl border border-gray-100 bg-gray-50">
              <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold text-lg mb-4">
                1
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Choose a template</h3>
              <p className="text-sm text-gray-600">
                Browse campaign templates sized for WhatsApp DP, social posts,
                and print materials.
              </p>
            </div>
            <div className="p-6 rounded-xl border border-gray-100 bg-gray-50">
              <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold text-lg mb-4">
                2
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Upload &amp; position your photo</h3>
              <p className="text-sm text-gray-600">
                Add your portrait, resize and position it in the photo zone,
                then edit text layers with your campaign message.
              </p>
            </div>
            <div className="p-6 rounded-xl border border-gray-100 bg-gray-50">
              <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold text-lg mb-4">
                3
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Export &amp; share</h3>
              <p className="text-sm text-gray-600">
                Download your design or share directly to WhatsApp, Facebook,
                X, or Telegram with one tap.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Built for Nigerian campaigns
            </h2>
            <p className="text-gray-600">
              Features designed for mobile-first organizers and supporters.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon="📱"
              title="Mobile-first editor"
              description="Edit and export campaign graphics directly from your phone on slow connections."
            />
            <FeatureCard
              icon="📸"
              title="Photo processing"
              description="Auto-strip EXIF, resize, crop, and apply circular or rounded photo masks."
            />
            <FeatureCard
              icon="⚡"
              title="Instant export"
              description="Export to Instagram, WhatsApp, Facebook, X, or print-ready A4."
            />
            <FeatureCard
              icon="📤"
              title="One-tap sharing"
              description="Share to WhatsApp, Facebook, X, and Telegram with pre-filled messages."
            />
            <FeatureCard
              icon="🌍"
              title="Nigerian languages"
              description="Yorùbá, Hausa, and Igbo support with proper font rendering."
            />
            <FeatureCard
              icon="🛡️"
              title="Authorization"
              description="Campaign authorization with disclaimer enforcement on every export."
            />
          </div>
        </div>
      </section>

      {/* For organizers */}
      <section className="py-16 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                For campaign organizers
              </h2>
              <p className="text-gray-600 mb-6">
                Create and manage approved brand templates that your supporters
                use to generate consistent campaign materials.
              </p>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 mt-1 text-brand-primary">✓</span>
                  <span>Upload and publish templates with locked photo zones</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 mt-1 text-brand-primary">✓</span>
                  <span>Set campaign authorization and disclaimer text</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 mt-1 text-brand-primary">✓</span>
                  <span>Review abuse reports and manage fonts</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 mt-1 text-brand-primary">✓</span>
                  <span>Track generation and sharing analytics</span>
                </li>
              </ul>
              {user ? (
                <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 text-brand-primary font-semibold hover:underline">
                  Go to Dashboard
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              ) : (
                <Link to="/signup" className="mt-6 inline-flex items-center gap-2 text-brand-primary font-semibold hover:underline">
                  Create Organizer Account
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Supporter experience</h3>
              <p className="text-sm text-gray-600 mb-4">
                Supporters open the app, pick a template, upload their photo,
                and generate a branded campaign DP — no account required.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="w-full">
                  Try as Guest
                </Button>
                <Button size="sm" className="w-full">
                  Sign Up
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl border border-gray-200 hover:shadow-lg transition bg-white">
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}
