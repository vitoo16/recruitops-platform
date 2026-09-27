'use client';

import type { Session } from '@supabase/supabase-js';
import { LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const VerifiedPrincipalSchema = z.object({
  id: z.string().min(1),
  email: z.email().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']),
});

type LoginForm = z.infer<typeof LoginSchema>;
type VerifiedPrincipal = z.infer<typeof VerifiedPrincipalSchema>;

export function AuthPanel() {
  const t = useTranslations('auth');
  const [session, setSession] = useState<Session | null>(null);
  const [principal, setPrincipal] = useState<VerifiedPrincipal | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing-config'>('loading');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const form = useForm<LoginForm>({
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus('missing-config');
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setStatus('ready');
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setPrincipal(null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setPrincipal(null);
      return;
    }

    let active = true;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) return;

    setVerifying(true);
    void fetch(`${apiUrl.replace(/\/$/, '')}/auth/me`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('verification_failed');
        return VerifiedPrincipalSchema.parse(await response.json());
      })
      .then((verified) => {
        if (active) setPrincipal(verified);
      })
      .catch(() => {
        if (active) setPrincipal(null);
      })
      .finally(() => {
        if (active) setVerifying(false);
      });

    return () => {
      active = false;
    };
  }, [session]);

  async function onSubmit(values: LoginForm) {
    setSubmitError(null);
    const result = LoginSchema.safeParse(values);
    if (!result.success) {
      setSubmitError(t('invalidForm'));
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSubmitError(t('missingConfig'));
      return;
    }

    const { error } = await supabase.auth.signInWithPassword(result.data);
    if (error) setSubmitError(t('loginFailed'));
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
  }

  if (status === 'loading') {
    return <p className="text-sm text-neutral-500">{t('loading')}</p>;
  }

  if (status === 'missing-config') {
    return <p className="text-sm leading-6 text-amber-700">{t('missingConfig')}</p>;
  }

  if (session) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">
              {principal?.email ?? session.user.email ?? t('authenticated')}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {verifying
                ? t('verifying')
                : principal
                  ? t('verifiedRole', { role: principal.role })
                  : t('sessionReady')}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void signOut()}>
          <LogOut className="mr-2 size-4" aria-hidden="true" />
          {t('signOut')}
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-email">
          {t('email')}
        </label>
        <Input
          id="auth-email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(form.formState.errors.email)}
          {...form.register('email')}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-password">
          {t('password')}
        </label>
        <Input
          id="auth-password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(form.formState.errors.password)}
          {...form.register('password')}
        />
      </div>
      {submitError ? (
        <p className="text-sm text-red-700" role="alert">
          {submitError}
        </p>
      ) : null}
      <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
        <LogIn className="mr-2 size-4" aria-hidden="true" />
        {form.formState.isSubmitting ? t('signingIn') : t('signIn')}
      </Button>
      <p className="text-xs leading-5 text-neutral-500">{t('provisioningNote')}</p>
    </form>
  );
}
