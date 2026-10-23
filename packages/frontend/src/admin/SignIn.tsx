import React, {type FormEvent, useState} from 'react';
import {Button, Field, Input, Status} from '../store/StoreStyles';
import {AdminApiError, signIn} from './api';
import {AuthCard, Muted, PanelTitle} from './AdminStyles';

// Password managers recognize this as a sign-in form: a real form with named
// username and current-password fields, a submit button, and a navigation
// once the credentials are accepted. The fields stay uncontrolled so values
// autofilled before the first interaction are still read on submit.
const SignIn = ({notice}: {notice?: string}) => {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await signIn(
        String(data.get('email') ?? '').trim(),
        String(data.get('password') ?? '')
      );
      // Reload the page the administrator asked for. The navigation is the
      // signal browsers use to offer saving the submitted password.
      window.location.assign(window.location.pathname + window.location.search);
    } catch (caught) {
      const status = caught instanceof AdminApiError ? caught.status : 0;
      setError(
        status === 429
          ? 'Too many attempts. Wait a minute and try again.'
          : status === 400 || status === 401
            ? 'Sign-in failed. Check your email and password.'
            : 'Sign-in is temporarily unavailable. Please try again.'
      );
      const password = form.elements.namedItem('password');
      if (password instanceof HTMLInputElement) {
        password.value = '';
        password.focus();
      }
      setBusy(false);
    }
  }

  return (
    <AuthCard>
      <PanelTitle>Sign in</PanelTitle>
      {notice ? <Status role="status">{notice}</Status> : null}
      <form
        method="post"
        action="/admin"
        aria-label="Admin sign in"
        onSubmit={submit}
      >
        <Field htmlFor="admin-email">
          Email
          <Input
            id="admin-email"
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
          />
        </Field>
        <Field htmlFor="admin-password">
          Password
          <Input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </Field>
        {error ? (
          <Status $error role="alert">
            {error}
          </Status>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <Muted style={{marginTop: 18}}>
        Registration is closed. Accounts are provisioned by the store operator.
      </Muted>
    </AuthCard>
  );
};

export default SignIn;
