import {afterAll, beforeAll, describe, it} from 'bun:test';
import assert from 'node:assert';
import {browser, expect, startBrowser, stopBrowser} from '../browser';
import {saveFailureArtifacts} from '../failureArtifacts';
import {BasePage} from '../pageObjects/base';

beforeAll(startBrowser, 60000);
afterAll(stopBrowser, 60000);

const variant = {
  id: 'hat-5950-7-1-4',
  sku: 'DOR-5950-7-1-4',
  label: '7 1/4',
  unitAmount: 2000,
  currency: 'usd',
  inventoryQuantity: 3,
  reservedQuantity: 1,
  soldQuantity: 4,
  active: true,
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const fixtures = {
  user: {email: 'admin@example.test', name: 'Administrator'},
  inventory: {
    products: [
      {
        id: 'hat-5950',
        slug: 'devops-rockstars-59fifty',
        name: 'DevOpsRockstars 59FIFTY',
        manufacturer: 'New Era',
        active: true,
        variants: [variant],
      },
    ],
  },
  orders: {
    orders: [
      {
        id: '12345678-1234-4234-8234-123456789abc',
        status: 'paid',
        currency: 'usd',
        subtotalAmount: 2000,
        shippingAmount: 0,
        totalAmount: 2000,
        email: 'buyer@example.test',
        shipping: {
          name: 'Test Buyer',
          addressLine1: '1 Test Way',
          addressLine2: '',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
        stripePaymentIntentId: 'pi_test_123',
        reservationExpiresAt: '2026-10-01T00:10:00.000Z',
        createdAt: '2026-10-01T00:00:00.000Z',
        paidAt: '2026-10-01T00:01:00.000Z',
        canceledAt: null,
        items: [
          {
            sku: 'DOR-5950-7-1-4',
            productName: 'DevOpsRockstars 59FIFTY',
            variantLabel: '7 1/4',
            unitAmount: 2000,
            quantity: 1,
            lineTotal: 2000,
          },
        ],
      },
    ],
    counts: {creating_payment: 0, awaiting_payment: 0, paid: 1, canceled: 0},
    nextCursor: null,
  },
};

describe('store admin', () => {
  it('signs in with a saveable password form and manages inventory and orders', async () => {
    // The session lives in sessionStorage so it survives the reload that
    // follows sign-in, like the store API's cookie.
    const api = await browser.addInitScript(fixtures => {
      const record = (key: string, value: string) =>
        sessionStorage.setItem(
          key,
          JSON.stringify([
            ...JSON.parse(sessionStorage.getItem(key) ?? '[]'),
            value,
          ])
        );
      const browserWindow: Window = window;
      browserWindow.fetch = async (input, init) => {
        const url = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
          location.href
        );
        if (
          !url.pathname.startsWith('/api/admin/') &&
          !url.pathname.startsWith('/api/auth/')
        )
          return Response.json(
            {error: {code: 'not_found', message: ''}},
            {status: 404}
          );
        record(
          '__admin_requests',
          `${init?.method ?? 'GET'} ${url.pathname}${url.search} ${init?.credentials}`
        );
        const signedIn = sessionStorage.getItem('__admin_signed_in') === '1';
        if (url.pathname === '/api/auth/get-session')
          return Response.json(
            signedIn ? {session: {}, user: fixtures.user} : null
          );
        if (url.pathname === '/api/auth/sign-in/email') {
          record('__admin_bodies', String(init?.body));
          sessionStorage.setItem('__admin_signed_in', '1');
          return Response.json({user: fixtures.user});
        }
        if (url.pathname === '/api/auth/sign-out') {
          if (sessionStorage.getItem('__admin_sign_out_fails'))
            return Response.json(
              {error: {code: 'auth_unavailable', message: ''}},
              {status: 503}
            );
          sessionStorage.removeItem('__admin_signed_in');
          return Response.json({success: true});
        }
        if (!signedIn)
          return Response.json(
            {error: {code: 'authentication_required', message: ''}},
            {status: 401}
          );
        if (url.pathname === '/api/admin/inventory')
          return Response.json(fixtures.inventory);
        if (url.pathname.startsWith('/api/admin/variants/')) {
          record('__admin_bodies', String(init?.body));
          const update = JSON.parse(String(init?.body));
          const product = fixtures.inventory.products[0];
          return Response.json({
            products: [
              {
                ...product,
                variants: [{...product?.variants[0], ...update}],
              },
            ],
          });
        }
        if (url.pathname === '/api/admin/orders')
          return Response.json(fixtures.orders);
        return Response.json(
          {error: {code: 'not_found', message: ''}},
          {status: 404}
        );
      };
    }, fixtures);
    try {
      await BasePage.open('admin');
      await BasePage.waitForAppReady();

      const form = await browser.$('form[aria-label="Admin sign in"]');
      await expect(form).toExist();
      assert.strictEqual(await form.getAttribute('method'), 'post');
      const email = await browser.$('#admin-email');
      const password = await browser.$('#admin-password');
      assert.deepStrictEqual(
        await browser.execute(() =>
          ['#admin-email', '#admin-password'].map(selector => {
            const input = document.querySelector<HTMLInputElement>(selector);
            return [input?.name, input?.type, input?.autocomplete];
          })
        ),
        [
          ['email', 'email', 'username'],
          ['password', 'password', 'current-password'],
        ]
      );
      assert.strictEqual(
        await browser.$('meta[name="robots"]').getAttribute('content'),
        'noindex, nofollow'
      );

      await email.setValue('admin@example.test');
      await password.setValue('local-test-password-0001');
      await browser
        .$('form[aria-label="Admin sign in"] button[type="submit"]')
        .click();

      const row = await browser.$('[data-testid="variant-hat-5950-7-1-4"]');
      await row.waitForExist({timeout: 15000});
      assert.deepStrictEqual(
        JSON.parse(
          await browser.execute(
            () => sessionStorage.getItem('__admin_bodies') ?? '[]'
          )
        ),
        [
          JSON.stringify({
            email: 'admin@example.test',
            password: 'local-test-password-0001',
          }),
        ]
      );

      const available = await browser.$(
        'input[aria-label="Available stock for size 7 1/4"]'
      );
      await available.setValue('10');
      await row.$('button[type="submit"]').click();
      await browser.waitUntil(
        async () =>
          (await available.getValue()) === '10' &&
          !(await row.$('button[type="submit"]').isEnabled()),
        {timeoutMsg: 'The saved quantity must replace the draft'}
      );
      const bodies = JSON.parse(
        await browser.execute(
          () => sessionStorage.getItem('__admin_bodies') ?? '[]'
        )
      ) as string[];
      assert.deepStrictEqual(JSON.parse(bodies.at(-1) ?? '{}'), {
        expectedInventoryQuantity: 3,
        inventoryQuantity: 10,
      });

      await browser.$('a[href="/admin/orders"]').click();
      const order = await browser.$(
        '[aria-label="Order 12345678-1234-4234-8234-123456789abc"]'
      );
      await order.waitForExist();
      assert.match(
        await order.getText(),
        /Test Buyer[\s\S]*1 Test Way[\s\S]*New York, NY 10001/u
      );

      await browser.$('a[href="/admin/account"]').click();
      const change = await browser.$('form[aria-label="Change password"]');
      await change.waitForExist();
      assert.deepStrictEqual(
        await browser.execute(() =>
          [
            ...document.querySelectorAll<HTMLInputElement>(
              'form[aria-label="Change password"] input'
            ),
          ].map(input => [input.name, input.autocomplete, input.hidden])
        ),
        [
          ['username', 'username', true],
          ['current-password', 'current-password', false],
          ['new-password', 'new-password', false],
          ['confirm-password', 'new-password', false],
        ]
      );

      // A failed sign-out keeps the page and says the session is active.
      await browser.execute(() =>
        sessionStorage.setItem('__admin_sign_out_fails', '1')
      );
      const signOut = await browser.$('button=Sign out');
      await signOut.click();
      const signOutAlert = await browser.$('[role="alert"]');
      await signOutAlert.waitForExist();
      assert.match(await signOutAlert.getText(), /still active/u);
      assert.match(await browser.getUrl(), /\/admin\/account$/u);
      await browser.execute(() =>
        sessionStorage.removeItem('__admin_sign_out_fails')
      );
      await signOut.click();
      await browser.$('#admin-email').waitForExist();
      assert.match(await browser.getUrl(), /\/admin$/u);

      const requests = JSON.parse(
        await browser.execute(
          () => sessionStorage.getItem('__admin_requests') ?? '[]'
        )
      ) as string[];
      assert.ok(
        requests.every(request => request.endsWith(' include')),
        requests.join('\n')
      );
    } catch (error) {
      await saveFailureArtifacts({
        'admin.png': Buffer.from(await browser.takeScreenshot(), 'base64'),
        'admin.html': await browser.getPageSource(),
      });
      throw error;
    } finally {
      await api.remove();
      await browser.execute(() => sessionStorage.clear());
    }
  });
});
