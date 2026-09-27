'use client';

import { Languages, Send, UsersRound } from 'lucide-react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthPanel } from '@/components/auth/auth-panel';
import { CandidateCrm } from '@/components/candidates/candidate-crm';
import { JobHub } from '@/components/jobs/job-hub';
import { Button } from '@/components/ui/button';
import en from '@/messages/en.json';
import vi from '@/messages/vi.json';

type Locale = 'vi' | 'en';

function HomeContent({ locale, onLocaleChange }: { locale: Locale; onLocaleChange: () => void }) {
  const t = useTranslations('home');

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-semibold tracking-[0.2em] text-neutral-500">RECRUITOPS</div>
        <Button variant="outline" onClick={onLocaleChange} aria-label={t('switchLanguage')}>
          <Languages className="mr-2 size-4" aria-hidden="true" />
          {locale === 'vi' ? 'EN' : 'VI'}
        </Button>
      </div>

      <section className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div>
          <p className="mb-4 text-sm font-medium text-neutral-500">{t('eyebrow')}</p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
            {t('title')}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">{t('description')}</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-neutral-500">{t('foundationLabel')}</p>
            <p className="mt-2 text-2xl font-semibold">{t('foundationStatus')}</p>
            <p className="mt-3 text-sm leading-6 text-neutral-600">{t('foundationHint')}</p>
          </div>
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="mb-4 text-sm font-medium text-neutral-500">{t('accessLabel')}</p>
            <AuthPanel />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label={t('capabilities')}>
        <article className="rounded-2xl border bg-white p-6">
          <Send className="size-5" aria-hidden="true" />
          <h2 className="mt-6 font-semibold">{t('publishingTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">{t('publishingDescription')}</p>
        </article>
        <article className="rounded-2xl border bg-white p-6">
          <UsersRound className="size-5" aria-hidden="true" />
          <h2 className="mt-6 font-semibold">{t('candidateTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">{t('candidateDescription')}</p>
        </article>
      </section>

      <JobHub />
      <CandidateCrm />
    </main>
  );
}

export function Home() {
  const [locale, setLocale] = useState<Locale>('vi');
  const messages = locale === 'vi' ? vi : en;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HomeContent
        locale={locale}
        onLocaleChange={() => setLocale(locale === 'vi' ? 'en' : 'vi')}
      />
    </NextIntlClientProvider>
  );
}
