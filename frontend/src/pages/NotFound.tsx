import React from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';

export function NotFound() {
  return (
    <Layout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-gray-200">404</h1>
          <h2 className="text-2xl font-semibold text-gray-900 mt-4">Page not found</h2>
          <p className="text-gray-600 mt-2">The page you&apos;re looking for doesn&apos;t exist.</p>
          <Link to="/" className="mt-6 inline-block">
            <Button variant="primary">Go Home</Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}