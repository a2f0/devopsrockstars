import React, {type FormEvent, useState} from 'react';
import {Button, Field, Input, Status} from '../store/StoreStyles';
import {AdminApiError, changePassword, signOut} from './api';
import {
  AuthCard,
  LinkButton,
  Muted,
  Panel,
  PanelHeader,
  PanelTitle,
} from './AdminStyles';
import {errorMessage, useAdmin} from './context';

// Safari generates suggested passwords that satisfy these rules.
const passwordRules = {passwordrules: 'minlength: 12; maxlength: 128;'};

const Account = () => {
  const {user, guard} = useAdmin();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const current = String(data.get('current-password') ?? '');
    const next = String(data.get('new-password') ?? '');
    if (next !== String(data.get('confirm-password') ?? '')) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await guard(changePassword(current, next));
      // Removing the submitted form is how browsers detect that the change
      // succeeded and offer to update the saved password.
      setChanged(true);
    } catch (caught) {
      if (!(caught instanceof AdminApiError && caught.status === 401))
        setError(
          caught instanceof AdminApiError && caught.status === 400
            ? 'Could not change the password. Check your current password and use 12–128 characters.'
            : caught instanceof AdminApiError && caught.status === 429
              ? 'Too many attempts. Wait a minute and try again.'
              : errorMessage(caught)
        );
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOut();
    } catch (caught) {
      // Only an expired session is already signed out; otherwise the session
      // is still active, so stay here and say so.
      if (!(caught instanceof AdminApiError && caught.status === 401)) {
        setSignOutError(
          'Sign-out failed, so this session is still active. Try again.'
        );
        setSigningOut(false);
        return;
      }
    }
    window.location.assign('/admin');
  }

  return (
    <>
      <Panel>
        <PanelHeader>
          <PanelTitle>Signed in</PanelTitle>
          <LinkButton type="button" onClick={leave} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </LinkButton>
        </PanelHeader>
        <p>{user.email}</p>
        {signOutError ? (
          <Status $error role="alert">
            {signOutError}
          </Status>
        ) : null}
      </Panel>
      <Panel>
        <PanelTitle>Change password</PanelTitle>
        {changed ? (
          <>
            <Status role="status">
              Password changed. Every other session was signed out.
            </Status>
            <LinkButton type="button" onClick={() => setChanged(false)}>
              Change it again
            </LinkButton>
          </>
        ) : (
          <AuthCard style={{margin: 0}}>
            <form
              method="post"
              action="/admin/account"
              aria-label="Change password"
              onSubmit={submit}
            >
              <input
                type="email"
                name="username"
                autoComplete="username"
                value={user.email}
                readOnly
                hidden
              />
              <Field htmlFor="admin-current-password">
                Current password
                <Input
                  id="admin-current-password"
                  name="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </Field>
              <Field htmlFor="admin-new-password">
                New password
                <Input
                  id="admin-new-password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  {...passwordRules}
                />
              </Field>
              <Field htmlFor="admin-confirm-password">
                Confirm new password
                <Input
                  id="admin-confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  {...passwordRules}
                />
              </Field>
              <Muted>
                Use 12–128 characters. Other sessions will be signed out.
              </Muted>
              {error ? (
                <Status $error role="alert">
                  {error}
                </Status>
              ) : null}
              <Button type="submit" disabled={busy}>
                {busy ? 'Changing password…' : 'Change password'}
              </Button>
            </form>
          </AuthCard>
        )}
      </Panel>
    </>
  );
};

export default Account;
