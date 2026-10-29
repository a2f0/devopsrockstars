import {afterAll, beforeAll, describe, it} from 'bun:test';
import assert from 'node:assert';
import {browser, expect, startBrowser, stopBrowser} from '../browser';
import {saveFailureArtifacts} from '../failureArtifacts';
import {BasePage} from '../pageObjects/base';

beforeAll(startBrowser, 60000);
afterAll(stopBrowser, 60000);

describe('store page', () => {
  it('reserves, resumes, edits, and polls a checkout with mocked APIs', async () => {
    const orderId = '12345678-1234-4234-8234-123456789abc';
    const replacementOrderId = '87654321-4321-4321-8321-cba987654321';
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const fixtures = {
      checkout: {
        clientSecret: 'pi_store_secret_test',
        currency: 'usd',
        expiresAt,
        lines: [
          {
            currency: 'usd',
            productName: 'DevOpsRockstars 59FIFTY',
            quantity: 1,
            unitAmount: 2000,
            variantId: 'hat-5950-7-1-4',
            variantLabel: '7 1/4',
          },
        ],
        orderId,
        orderToken: 'order-token',
        totalAmount: 2000,
      },
      replacement: {
        clientSecret: 'pi_replacement_secret_test',
        orderId: replacementOrderId,
        orderToken: 'replacement-token',
      },
      storefront: {
        products: [
          {
            id: 'hat-5950',
            slug: 'devops-rockstars-59fifty',
            name: 'DevOpsRockstars 59FIFTY',
            manufacturer: 'New Era',
            description:
              'Embroidered New Era Low Crown 59FIFTY\nFitted, black.',
            imagePath: '/static/image/store/5950.svg',
            variants: [
              {
                id: 'hat-5950-7-1-8',
                label: '7 1/8',
                sku: 'DOR-5950-7-1-8',
                unitAmount: 2000,
                currency: 'usd',
                availableQuantity: 1,
              },
              {
                id: 'hat-5950-7-1-4',
                label: '7 1/4',
                sku: 'DOR-5950-7-1-4',
                unitAmount: 2000,
                currency: 'usd',
                availableQuantity: 1,
              },
            ],
          },
        ],
        stripePublishableKey: 'pk_test_store',
      },
    };
    // Keeps the page's uncaught errors for the failure evidence below. This
    // test has failed intermittently in CI with its edit form disappearing.
    const resetErrorLog = await browser.addInitScript(() => {
      const errors: string[] = [];
      Object.assign(window, {__storeTestErrors: errors});
      addEventListener('error', event =>
        errors.push(`error: ${(event as ErrorEvent).message}`)
      );
      addEventListener('unhandledrejection', event =>
        errors.push(
          `rejection: ${String((event as PromiseRejectionEvent).reason)}`
        )
      );
      const consoleError = console.error.bind(console);
      console.error = (...args: unknown[]) => {
        errors.push(`console.error: ${args.map(String).join(' ')}`);
        consoleError(...args);
      };
    });
    const resetFixtures = await browser.addInitScript(fixtures => {
      const originalFetch = globalThis.fetch.bind(globalThis);
      const browserWindow: Window = window;
      // Holds a request until the test sets this session flag, so the test
      // can check the page while the request is in flight however slowly the
      // browser runs.
      const heldUntil = async (flag: string) => {
        while (!sessionStorage.getItem(flag)) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      };
      browserWindow.fetch = async (input, init) => {
        const inputUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const url = new URL(inputUrl, globalThis.location.href);
        if (url.pathname === '/api/storefront') {
          return Response.json(fixtures.storefront);
        }
        if (url.pathname === '/api/checkouts' && init?.method === 'POST') {
          const calls = Number(
            sessionStorage.getItem('__store_test_checkout_calls') ?? '0'
          );
          sessionStorage.setItem(
            '__store_test_checkout_calls',
            String(calls + 1)
          );
          // The first reservation waits for the test, which types into the
          // form meanwhile.
          if (calls === 0) {
            await heldUntil('__store_test_release_checkout');
          }
          sessionStorage.setItem(
            '__store_test_checkout_body',
            String(init.body)
          );
          // Reserving again after an address change fails twice, then
          // returns a new order.
          if (calls === 1 || calls === 2) {
            return Response.json(
              {
                error: {
                  code: 'checkout_unavailable',
                  message:
                    'The store is busy. Please try again in a few minutes.',
                },
              },
              {status: 503}
            );
          }
          return Response.json(
            calls === 0
              ? fixtures.checkout
              : {...fixtures.checkout, ...fixtures.replacement},
            {status: 201}
          );
        }
        const order = /^\/api\/orders\/([^/]+)(\/cancel)?$/u.exec(url.pathname);
        if (order?.[1] && order[2] && init?.method === 'POST') {
          // A held cancellation that fails, as when a payment is processing.
          if (sessionStorage.getItem('__store_test_cancel_fails')) {
            await heldUntil('__store_test_release_cancel');
            return Response.json(
              {
                error: {
                  code: 'payment_processing',
                  message:
                    'The payment is already processing and cannot be canceled here.',
                },
              },
              {status: 409}
            );
          }
          sessionStorage.setItem(
            '__store_test_canceled',
            `${order[1]} ${new Headers(init.headers).get('X-Order-Token')}`
          );
          return Response.json({
            currency: 'usd',
            expiresAt: fixtures.checkout.expiresAt,
            orderId: order[1],
            status: 'canceled',
            totalAmount: 2000,
          });
        }
        if (order?.[1] && !order[2]) {
          const calls = Number(
            sessionStorage.getItem('__store_test_order_calls') ?? '0'
          );
          sessionStorage.setItem('__store_test_order_calls', String(calls + 1));
          return Response.json({
            currency: 'usd',
            expiresAt: fixtures.checkout.expiresAt,
            orderId: order[1],
            status: calls === 0 ? 'awaiting_payment' : 'paid',
            totalAmount: 2000,
          });
        }
        return originalFetch(input, init);
      };
    }, fixtures);

    // Payment is visible before and after a reload. Waiting for that UI alone
    // can accept the old document and start editing a form the reload removes.
    // Require a fresh document, then reacquire inputs from that document.
    const reloadCheckout = async () => {
      await browser.execute(() => {
        document.documentElement.dataset['checkoutReloadPending'] = 'true';
      });
      await browser.refresh();
      await browser.waitUntil(
        () =>
          browser.execute(
            () => !document.documentElement.dataset['checkoutReloadPending']
          ),
        {timeoutMsg: 'Checkout reload must replace the previous document'}
      );
      await BasePage.waitForAppReady();
    };
    let phase = 'initial checkout';
    try {
      // A known width keeps the product copy's line count deterministic.
      await browser.setWindowSize(1280, 1000);
      await BasePage.openStaging('');
      await browser.execute(() => sessionStorage.clear());
      await BasePage.openStaging('store');
      await BasePage.waitForAppReady();
      const size = await browser.$('[role="combobox"][aria-label$="size"]');
      await expect(size).toBeEnabled();
      // The description keeps the line breaks the catalog stores: copy that
      // would fit on one line at this width still renders as two.
      assert.strictEqual(
        await browser.execute(() => {
          const copy = document.querySelector('main p');
          if (!copy) return 0;
          const lineHeight = parseFloat(getComputedStyle(copy).lineHeight);
          return Math.round(copy.getBoundingClientRect().height / lineHeight);
        }),
        2
      );
      // The first variant is selected by default. The caret beneath the box
      // opens the list, and clicking elsewhere closes it.
      await expect(size).toHaveText('7 1/8');
      const caret = await browser.$('[data-size-caret]');
      const sizes = await browser.$('[role="listbox"][aria-label$="size"]');
      await caret.click();
      await expect(sizes).toBeDisplayed();
      await (await browser.$('[data-product-price]')).click();
      await expect(sizes).not.toBeDisplayed();
      await caret.click();
      await (await sizes.$('[role="option"]=7 1/4')).click();
      await expect(sizes).not.toBeDisplayed();
      await expect(size).toHaveText('7 1/4');
      // Move off the option so hover cannot compete with keyboard focus
      // when the list reopens beneath the pointer.
      await (await browser.$('[data-product-price]')).moveTo();
      // The keyboard walks the list; Escape keeps the size, and Enter or
      // Space picks one without reopening the list.
      await browser.keys(['ArrowDown', 'ArrowUp', 'Escape']);
      await expect(size).toHaveText('7 1/4');
      await browser.keys(['ArrowDown', 'ArrowUp', 'Enter']);
      await expect(size).toHaveText('7 1/8');
      await browser.keys(['ArrowDown', 'ArrowDown', ' ']);
      await expect(sizes).not.toBeDisplayed();
      await expect(size).toHaveText('7 1/4');
      assert.strictEqual(
        await browser.execute(() =>
          document
            .querySelector('[data-ct="store.add-to-cart"]')
            ?.closest('[data-ct-app]')
            ?.getAttribute('data-ct-app')
        ),
        'store'
      );
      await (await browser.$('button=Add to cart')).click();
      await expect(
        await browser.$('aside[aria-label="Shopping cart"]')
      ).toHaveText('7 1/4', {containing: true});
      await (await browser.$('a=Checkout')).click();

      const customerName = await browser.$('input[name="name"]');
      await customerName.waitForDisplayed();
      await expect(
        await browser.$('h1 pre[role="img"][aria-label="checkout"]')
      ).toBeDisplayed();
      expect(
        await browser.execute(() => {
          const art = document.querySelector('h1 pre[aria-label="checkout"]');
          return (
            art instanceof HTMLElement &&
            art.querySelector('.face') !== null &&
            art.scrollWidth <= art.clientWidth + 1
          );
        })
      ).toBe(true);
      await customerName.setValue('Grace Hopper');
      await (await browser.$('input[name="email"]')).setValue(
        'grace@example.com'
      );
      await (await browser.$('input[name="address-line1"]')).setValue(
        '1 Navy Way'
      );
      await (await browser.$('input[name="city"]')).setValue('New York');
      await (await browser.$('input[name="state"]')).setValue('NY');
      await (await browser.$('input[name="postal-code"]')).setValue('10001');
      const continueToPayment = await browser.$('button=Continue to payment');
      await expect(continueToPayment).toBeEnabled();
      await continueToPayment.click();
      await expect(await browser.$('button=Reserving…')).toExist();
      await customerName.setValue('Grace Brewster Hopper');
      await expect(customerName).toHaveValue('Grace Brewster Hopper');
      await browser.execute(() =>
        sessionStorage.setItem('__store_test_release_checkout', 'true')
      );

      const shippingAddress = () => browser.$('[data-shipping-address]');
      const testCalls = () =>
        browser.execute(() => ({
          canceled: sessionStorage.getItem('__store_test_canceled'),
          checkout: sessionStorage.getItem('__store_test_checkout_calls'),
        }));
      await expect(await browser.$('h2=Payment')).toExist();
      // The reserved address replaces the form with a compact summary.
      await expect(await shippingAddress()).toHaveText(
        'Grace Hopper\ngrace@example.com\n1 Navy Way\nNew York, NY 10001'
      );
      await expect(await browser.$('input[name="name"]')).not.toExist();
      phase = 'edit before reload';
      // Edit opens the reserved address, not what was typed while reserving.
      await (await browser.$('button=Edit')).click();
      await expect(await browser.$('input[name="name"]')).toHaveValue(
        'Grace Hopper'
      );
      await (await browser.$('button=Cancel')).click();
      assert.strictEqual(
        await browser.execute(() =>
          sessionStorage.getItem('__store_test_checkout_calls')
        ),
        '1'
      );
      assert.ok(
        await browser.execute(() =>
          sessionStorage.getItem('devopsrockstars.store.pending-checkout')
        )
      );

      await reloadCheckout();
      await expect(await browser.$('h2=Payment')).toExist();
      await expect(await shippingAddress()).toHaveText('Grace Hopper', {
        containing: true,
      });
      assert.deepStrictEqual(await testCalls(), {
        canceled: null,
        checkout: '1',
      });

      phase = 'edit after reload';
      // Editing reopens the filled form and hides payment. Canceling the edit,
      // or saving the same address, keeps the reservation.
      await (await browser.$('button=Edit')).click();
      const addressLine1 = () => browser.$('input[name="address-line1"]');
      await expect(await addressLine1()).toHaveValue('1 Navy Way');
      await expect(await browser.$('input[name="name"]')).toBeFocused();
      await expect(await browser.$('h2=Payment')).not.toExist();
      await (await addressLine1()).setValue('2 Navy Way');
      await (await browser.$('button=Cancel')).click();
      await expect(await shippingAddress()).toHaveText('1 Navy Way', {
        containing: true,
      });
      await expect(await browser.$('h2=Payment')).toExist();
      await (await browser.$('button=Edit')).click();
      await expect(await addressLine1()).toHaveValue('1 Navy Way');
      await (await browser.$('button=Continue to payment')).click();
      await expect(await shippingAddress()).toHaveText('1 Navy Way', {
        containing: true,
      });
      assert.deepStrictEqual(await testCalls(), {
        canceled: null,
        checkout: '1',
      });

      phase = 'replace reservation after reload';
      // A new address cancels the order and reserves the same items again
      // with new credentials, even after the cart changed and a reload
      // followed failed replacement attempts. The reload restores the
      // address of the latest attempt.
      await browser.execute(() =>
        sessionStorage.setItem(
          'devopsrockstars.store.cart',
          JSON.stringify([{variantId: 'hat-5950-7-1-8', quantity: 2}])
        )
      );
      await reloadCheckout();
      await (await browser.$('button=Edit')).click();
      await (await addressLine1()).setValue('2 Navy Way');
      await (await browser.$('input[name="address-line2"]')).setValue('Apt 4');
      const busyStatus = await browser.$(
        'p=The store is busy. Please try again in a few minutes.'
      );
      await (await browser.$('button=Continue to payment')).click();
      await expect(busyStatus).toExist();
      const addressLine2 = () => browser.$('input[name="address-line2"]');
      await (await addressLine2()).setValue('Apt 5');
      await (await browser.$('button=Continue to payment')).click();
      await browser.waitUntil(async () => (await testCalls()).checkout === '3');
      await expect(busyStatus).toExist();
      phase = 'restore replacement after reload';
      await reloadCheckout();
      await expect(await addressLine1()).toHaveValue('2 Navy Way');
      await expect(await addressLine2()).toHaveValue('Apt 5');
      await expect(
        await browser.$('span=DevOpsRockstars 59FIFTY — 7 1/4 × 1')
      ).toExist();
      await (await browser.$('button=Continue to payment')).click();
      await expect(await shippingAddress()).toHaveText('2 Navy Way, Apt 5', {
        containing: true,
      });
      await expect(await browser.$('h2=Payment')).toExist();
      assert.deepStrictEqual(await testCalls(), {
        canceled: `${orderId} order-token`,
        checkout: '4',
      });
      const replacement = await browser.execute(
        id => ({
          request: JSON.parse(
            sessionStorage.getItem('__store_test_checkout_body') ?? 'null'
          ),
          pending: JSON.parse(
            sessionStorage.getItem('devopsrockstars.store.pending-checkout') ??
              'null'
          ),
          token: sessionStorage.getItem(`devopsrockstars.store.order.${id}`),
          draft: sessionStorage.getItem('devopsrockstars.store.shipping-draft'),
        }),
        replacementOrderId
      );
      assert.deepStrictEqual(replacement.request.items, [
        {variantId: 'hat-5950-7-1-4', quantity: 1},
      ]);
      assert.strictEqual(
        replacement.request.shipping.addressLine1,
        '2 Navy Way'
      );
      assert.strictEqual(replacement.request.shipping.addressLine2, 'Apt 5');
      assert.deepStrictEqual(
        replacement.pending.shipping,
        replacement.request.shipping
      );
      assert.strictEqual(
        replacement.pending.checkout.orderId,
        replacementOrderId
      );
      assert.strictEqual(
        replacement.pending.checkout.clientSecret,
        'pi_replacement_secret_test'
      );
      assert.strictEqual(replacement.token, 'replacement-token');
      assert.strictEqual(replacement.draft, null);

      // The address stays locked while the payment form is busy, and unlocks
      // once that work fails.
      await browser.execute(() =>
        sessionStorage.setItem('__store_test_cancel_fails', 'true')
      );
      const edit = await browser.$('button=Edit');
      await expect(edit).toBeEnabled();
      await (await browser.$('button=Cancel checkout')).click();
      await expect(await browser.$('button=Canceling…')).toExist();
      await expect(edit).toBeDisabled();
      await browser.execute(() =>
        sessionStorage.setItem('__store_test_release_cancel', 'true')
      );
      await expect(
        await browser.$(
          'p=The payment is already processing and cannot be canceled here.'
        )
      ).toExist();
      await expect(edit).toBeEnabled();
      await browser.execute(() =>
        sessionStorage.removeItem('__store_test_cancel_fails')
      );

      await BasePage.openStaging(`store/receipt?order=${replacementOrderId}`);
      await expect(
        await browser.$('p=Thank you. Your payment is complete.')
      ).toExist();
      await browser.waitUntil(async () =>
        browser.execute(
          () => Number(sessionStorage.getItem('__store_test_order_calls')) >= 2
        )
      );
      assert.strictEqual(
        await browser.execute(() =>
          sessionStorage.getItem('devopsrockstars.store.cart')
        ),
        '[]'
      );
    } catch (failure) {
      const state = await browser.execute(() => ({
        url: location.href,
        errors:
          (window as unknown as {__storeTestErrors?: string[]})
            .__storeTestErrors ?? null,
        rootChildren: document.getElementById('©')?.childElementCount ?? null,
        activeElement: document.activeElement?.outerHTML.slice(0, 500),
        sessionStorage: {...sessionStorage},
      }));
      await saveFailureArtifacts({
        'store-checkout.png': Buffer.from(
          await browser.takeScreenshot(),
          'base64'
        ),
        'store-checkout.html': await browser.getPageSource(),
        'store-checkout.json': JSON.stringify({phase, ...state}, null, 2),
      });
      throw failure;
    } finally {
      await browser.execute(() => sessionStorage.clear());
      await resetFixtures.remove();
      await resetErrorLog.remove();
    }
  });

  it('fills the whole shipping form from one saved address', async () => {
    const storefront = await browser.addInitScript(() => {
      const originalFetch = globalThis.fetch.bind(globalThis);
      const browserWindow: Window = window;
      browserWindow.fetch = async (input, init) =>
        String(input).endsWith('/api/storefront')
          ? Response.json({
              products: [
                {
                  id: 'hat-5950',
                  name: 'DevOpsRockstars 59FIFTY',
                  description: 'Fitted, black.',
                  imagePath: '/static/image/store/5950.svg',
                  variants: [
                    {
                      id: 'hat-5950-7-1-4',
                      label: '7 1/4',
                      unitAmount: 2000,
                      currency: 'usd',
                      availableQuantity: 1,
                    },
                  ],
                },
              ],
              stripePublishableKey: 'pk_test_store',
            })
          : originalFetch(input, init);
    });

    try {
      // Start without a pending checkout, which shows payment instead of the
      // form.
      await BasePage.openStaging('');
      await browser.execute(() => {
        sessionStorage.clear();
        sessionStorage.setItem(
          'devopsrockstars.store.cart',
          JSON.stringify([{variantId: 'hat-5950-7-1-4', quantity: 1}])
        );
      });
      await BasePage.openStaging('store/checkout');
      await BasePage.waitForAppReady();
      await (await browser.$('input[name="address-line1"]')).waitForDisplayed();

      // The DevTools protocol drives the browser's own address autofill.
      // Starting from the street field, one saved address fills the name and
      // email too, and its full state name becomes the state code.
      const {root} = await browser.sendCommandAndGetResult('DOM.getDocument', {
        depth: 0,
      });
      const {nodeId} = await browser.sendCommandAndGetResult(
        'DOM.querySelector',
        {nodeId: root.nodeId, selector: 'input[name="address-line1"]'}
      );
      const {node} = await browser.sendCommandAndGetResult('DOM.describeNode', {
        nodeId,
      });
      await browser.sendCommandAndGetResult('Autofill.trigger', {
        fieldId: node.backendNodeId,
        address: {
          fields: [
            {name: 'NAME_FULL', value: 'Grace Hopper'},
            {name: 'EMAIL_ADDRESS', value: 'grace@example.com'},
            {name: 'ADDRESS_HOME_LINE1', value: '1 Navy Way'},
            {name: 'ADDRESS_HOME_LINE2', value: 'Apt 4'},
            {name: 'ADDRESS_HOME_CITY', value: 'New York'},
            {name: 'ADDRESS_HOME_STATE', value: 'New York'},
            {name: 'ADDRESS_HOME_ZIP', value: '10001'},
            {name: 'ADDRESS_HOME_COUNTRY', value: 'US'},
          ],
        },
      });

      const expected = {
        name: 'Grace Hopper',
        email: 'grace@example.com',
        'address-line1': '1 Navy Way',
        'address-line2': 'Apt 4',
        city: 'New York',
        state: 'NY',
        'postal-code': '10001',
      };
      for (const [name, value] of Object.entries(expected)) {
        await expect(await browser.$(`input[name="${name}"]`)).toHaveValue(
          value
        );
      }
      // Autofilled fields keep the store's dark look rather than the browser's
      // light autofill colors.
      assert.deepEqual(
        await browser.execute(() => {
          const input = document.querySelector('input[name="name"]');
          if (!input) return null;
          const style = getComputedStyle(input);
          return [style.webkitTextFillColor, style.boxShadow];
        }),
        ['rgb(255, 255, 255)', 'rgb(8, 8, 8) 0px 0px 0px 1000px inset']
      );
    } finally {
      await browser.execute(() => sessionStorage.clear());
      await storefront.remove();
    }
  });

  it('shows a graceful unavailable state without the Worker API', async () => {
    await BasePage.openStaging('store');
    await BasePage.waitForAppReady();

    await expect(
      await browser.$('p=The store is temporarily unavailable.')
    ).toExist();
  });
});
