import assert from 'node:assert';
import {Base, BasePage} from '../pageObjects/base';

describe('staging environment', () => {
  it('keeps search and store in the navigation for testing', async () => {
    await BasePage.openStaging('');
    await BasePage.waitForAppReady();

    await expect(await browser.$('a[href="/search"]')).toExist();
    await expect(await browser.$('a[href="/store"]')).toExist();
    await expect(await browser.$('a[href="/company"]')).toExist();
  });

  it('tells crawlers not to index the document', async () => {
    await BasePage.openStaging('');
    await BasePage.waitForAppReady();

    const robots = await browser.$('meta[name="robots"]');
    assert.strictEqual(
      await robots.getAttribute('content'),
      'noindex, nofollow'
    );
  });

  it('serves a robots.txt that disallows everything', async () => {
    await browser.url(`${Base.stagingOrigin}/robots.txt`);
    const body = await browser.$('body');
    assert.match(await body.getText(), /User-agent: \*\s+Disallow: \//u);
  });
});

describe('search page', () => {
  it('shows the original search frontend', async () => {
    await BasePage.openStaging('search');
    await BasePage.waitForAppReady();

    const logo = await browser.$(
      'img[src="/static/image/devopsrockstars-solr.svg"]'
    );
    await expect(logo).toBeDisplayed();

    const searchInput = await browser.$('input[aria-label="Search"]');
    await searchInput.setValue('continuous delivery');
    await browser.keys('Enter');

    await expect(await browser.$('[role="status"]')).toHaveText(
      'Search results are not connected yet. Stay tuned.'
    );
  });
});

describe('store page', () => {
  it('reserves, resumes, and polls a checkout with mocked APIs', async () => {
    const orderId = '12345678-1234-4234-8234-123456789abc';
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const fixtures = {
      checkout: {
        clientSecret: 'pi_store_secret_test',
        currency: 'usd',
        expiresAt,
        lines: [
          {
            currency: 'usd',
            productName: 'DevOps Rockstars 59FIFTY',
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
      orderId,
      storefront: {
        products: [
          {
            id: 'hat-5950',
            slug: 'devops-rockstars-59fifty',
            name: 'DevOps Rockstars 59FIFTY',
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
    const resetFixtures = await browser.addInitScript(fixtures => {
      const originalFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (input, init) => {
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
          return Response.json(fixtures.checkout, {status: 201});
        }
        if (url.pathname === `/api/orders/${fixtures.orderId}`) {
          const calls = Number(
            sessionStorage.getItem('__store_test_order_calls') ?? '0'
          );
          sessionStorage.setItem('__store_test_order_calls', String(calls + 1));
          return Response.json({
            currency: 'usd',
            expiresAt: fixtures.checkout.expiresAt,
            orderId: fixtures.orderId,
            status: calls === 0 ? 'awaiting_payment' : 'paid',
            totalAmount: 2000,
          });
        }
        return originalFetch(input, init);
      };
    }, fixtures);

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
      // The keyboard walks the list; Escape keeps the size, and Enter or
      // Space picks one without reopening the list.
      await browser.keys(['ArrowDown', 'ArrowUp', 'Escape']);
      await expect(size).toHaveText('7 1/4');
      await browser.keys(['ArrowDown', 'ArrowUp', 'Enter']);
      await expect(size).toHaveText('7 1/8');
      await browser.keys(['ArrowDown', 'ArrowDown', ' ']);
      await expect(sizes).not.toBeDisplayed();
      await expect(size).toHaveText('7 1/4');
      await (await browser.$('button=Add to cart')).click();
      await expect(
        await browser.$('aside[aria-label="Shopping cart"]')
      ).toHaveText('7 1/4', {containing: true});
      await (await browser.$('a=Checkout')).click();

      const customerName = await browser.$('input[name="name"]');
      await customerName.waitForDisplayed();
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
      await (await browser.$('button=Continue to payment')).click();

      await expect(await browser.$('h2=Payment')).toExist();
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

      await browser.refresh();
      await BasePage.waitForAppReady();
      await expect(await browser.$('h2=Payment')).toExist();
      await expect(await browser.$('input[name="name"]')).toHaveValue(
        'Grace Hopper'
      );
      assert.strictEqual(
        await browser.execute(() =>
          sessionStorage.getItem('__store_test_checkout_calls')
        ),
        '1'
      );

      await BasePage.openStaging(`store/receipt?order=${orderId}`);
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
    } finally {
      await resetFixtures.remove();
    }
  });

  it('fills the whole shipping form from one saved address', async () => {
    const storefront = await browser.addInitScript(() => {
      const originalFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (input, init) =>
        String(input).endsWith('/api/storefront')
          ? Response.json({
              products: [
                {
                  id: 'hat-5950',
                  name: 'DevOps Rockstars 59FIFTY',
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
      await BasePage.openStaging('');
      await browser.execute(() =>
        sessionStorage.setItem(
          'devopsrockstars.store.cart',
          JSON.stringify([{variantId: 'hat-5950-7-1-4', quantity: 1}])
        )
      );
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
