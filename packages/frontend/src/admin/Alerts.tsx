import type {AdminAlert} from '@devopsrockstars/shared-types';
import React, {useCallback, useEffect, useState} from 'react';
import {formatMoney} from '../store/format';
import {Status} from '../store/StoreStyles';
import {AdminApiError, loadAlerts, resolveAlert} from './api';
import {
  Badge,
  Code,
  LinkButton,
  Muted,
  Panel,
  PanelHeader,
  SmallButton,
} from './AdminStyles';
import {errorMessage, formatDate, useAdmin} from './context';

const actionHelp: Record<AdminAlert['action'], string> = {
  refund:
    'A payment succeeded for an order the store could not fulfill. Refund it in Stripe, then mark this resolved.',
  investigate:
    'A Stripe event could not be applied to its order. Check the payment in Stripe, then mark this resolved.',
};

const Alerts = () => {
  const {guard} = useAdmin();
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [alerts, setAlerts] = useState<readonly AdminAlert[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const report = useCallback((caught: unknown) => {
    if (!(caught instanceof AdminApiError && caught.status === 401))
      setError(errorMessage(caught));
  }, []);

  useEffect(() => {
    setAlerts(null);
    setError('');
    guard(loadAlerts(status))
      .then(response => setAlerts(response.alerts))
      .catch(report);
  }, [status, guard, report]);

  async function resolve(alert: AdminAlert) {
    if (
      !window.confirm(
        `Mark the ${alert.action} alert for payment ${alert.paymentIntentId} as resolved?`
      )
    )
      return;
    setBusy(alert.eventId);
    setError('');
    try {
      setAlerts((await guard(resolveAlert(alert.eventId))).alerts);
    } catch (caught) {
      report(caught);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PanelHeader>
        <Muted>
          Store events that need an operator: payments that arrived after an
          order expired or that did not match their order.
        </Muted>
        <LinkButton
          type="button"
          onClick={() => setStatus(status === 'open' ? 'resolved' : 'open')}
        >
          {status === 'open' ? 'Show resolved' : 'Show open'}
        </LinkButton>
      </PanelHeader>
      {error ? (
        <Status $error role="alert">
          {error}
        </Status>
      ) : null}
      {alerts === null ? (
        error ? null : (
          <p role="status">Loading alerts…</p>
        )
      ) : alerts.length === 0 ? (
        <p>{status === 'open' ? 'No open alerts.' : 'No resolved alerts.'}</p>
      ) : (
        alerts.map(alert => (
          <Panel key={alert.eventId} aria-label={`Alert ${alert.eventId}`}>
            <PanelHeader>
              <div>
                <Badge $tone={alert.action === 'refund' ? 'bad' : 'warn'}>
                  {alert.action}
                </Badge>{' '}
                {alert.reason.replaceAll('_', ' ')} ·{' '}
                {formatDate(alert.createdAt)}
              </div>
              {alert.status === 'open' ? (
                <SmallButton
                  type="button"
                  disabled={busy === alert.eventId}
                  onClick={() => void resolve(alert)}
                >
                  Mark resolved
                </SmallButton>
              ) : alert.resolvedAt ? (
                <Muted>Resolved {formatDate(alert.resolvedAt)}</Muted>
              ) : null}
            </PanelHeader>
            <Muted>{actionHelp[alert.action]}</Muted>
            <Muted style={{marginTop: 8}}>
              Payment <Code>{alert.paymentIntentId}</Code>
              {alert.amountReceived !== null && alert.currency
                ? ` · ${formatMoney(alert.amountReceived, alert.currency)} received`
                : ''}
              <br />
              Order <Code>{alert.orderId}</Code> · Event{' '}
              <Code>{alert.eventId}</Code>
            </Muted>
          </Panel>
        ))
      )}
    </>
  );
};

export default Alerts;
