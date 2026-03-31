'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppSelector } from '@/store/hooks';
import { ArrowRight, CheckCircle, BarChart3, Users } from 'lucide-react';
import Link from 'next/link';

const HomePage = () => {
  const router = useRouter();
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const features = [
    {
      icon: CheckCircle,
      title: 'Smart Summaries',
      description:
        'AI-powered summaries of your meetings in seconds. Never miss important points again.',
    },
    {
      icon: BarChart3,
      title: 'Action Items',
      description:
        'Automatically extracted tasks with ownership and deadlines. Keep your team aligned.',
    },
    {
      icon: Users,
      title: 'Team Insights',
      description:
        'Analyze trends across meetings. Understand team performance and collaboration patterns.',
    },
  ];

  return (
    <div className="min-h-screen w-full overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Animated gradient blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-gradient-to-br from-indigo-200 to-violet-200 opacity-30 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gradient-to-tr from-violet-200 to-purple-200 opacity-30 blur-3xl"></div>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Navigation */}
        <nav className="container-max flex items-center justify-between border-b border-gray-200 bg-white/50 py-4 backdrop-blur-sm">
          <div className="text-2xl font-bold gradient-text">Sumsy</div>
          <Link
            href="/login"
            className="btn btn-primary"
          >
            Sign In
          </Link>
        </nav>

        {/* Hero Section */}
        <section className="container-max py-20 sm:py-32">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <div className="mb-8 inline-block">
              <span className="rounded-full bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-700">
                ✨ Powered by AI
              </span>
            </div>

            {/* Main heading */}
            <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl">
              <span className="gradient-text">Transform Your Meetings</span>
              <span className="block text-gray-900">With AI Intelligence</span>
            </h1>

            {/* Tagline */}
            <p className="mb-8 text-xl text-gray-600 sm:text-2xl">
              Get AI-powered summaries, action items, and team insights from every meeting. Save time, stay organized, and never miss important details.
            </p>

            {/* CTA Button */}
            <Link
              href="/login"
              className="btn btn-primary mb-12 inline-flex h-14 px-8 text-lg"
            >
              Sign in with Microsoft
              <ArrowRight className="h-5 w-5" />
            </Link>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 sm:gap-8">
              <div>
                <p className="text-3xl font-bold text-indigo-600">500+</p>
                <p className="text-gray-600">Meetings Analyzed</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-cyan-600">98%</p>
                <p className="text-gray-600">Accuracy Rate</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-indigo-600">10h+</p>
                <p className="text-gray-600">Time Saved</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="container-max py-20">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Why Choose Sumsy?</h2>
            <p className="text-lg text-gray-600">Everything you need to get more from your meetings</p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="card-hover p-8"
                >
                  <div className="mb-4 inline-flex rounded-lg bg-indigo-100 p-3">
                    <Icon className="h-6 w-6 text-indigo-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA Section */}
        <section className="container-max py-20">
          <div className="rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 px-8 py-16 text-center text-white sm:px-12">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
              Ready to transform your meetings?
            </h2>
            <p className="mb-8 text-lg text-indigo-50">
              Join teams that are already saving hours every week with Sumsy.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-8 py-3 font-semibold text-indigo-600 transition-all hover:bg-indigo-50"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-200 bg-white/50 py-8 backdrop-blur-sm">
          <div className="container-max">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <p className="text-gray-600">© 2024 Sumsy. All rights reserved.</p>
              <div className="flex gap-6 text-gray-600">
                <a href="#" className="hover:text-gray-900 transition-smooth">
                  Privacy
                </a>
                <a href="#" className="hover:text-gray-900 transition-smooth">
                  Terms
                </a>
                <a href="#" className="hover:text-gray-900 transition-smooth">
                  Contact
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default HomePage;
