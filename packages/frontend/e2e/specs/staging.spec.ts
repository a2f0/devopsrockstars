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
            description: 'Low Crown 59FIFTY cap.\nFitted, black.',
            imagePath: '/static/image/store/5950.svg',
            variants: [
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
      await expect(
        await browser.$('img[alt="DevOps Rockstars 59FIFTY"]')
      ).toExist();
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
      await (await browser.$('button=Add to cart')).click();
      await (await browser.$('a=Checkout')).click();

      await (await browser.$('input[autocomplete="name"]')).setValue(
        'Grace Hopper'
      );
      await (await browser.$('input[autocomplete="email"]')).setValue(
        'grace@example.com'
      );
      await (
        await browser.$('input[autocomplete="shipping address-line1"]')
      ).setValue('1 Navy Way');
      await (
        await browser.$('input[autocomplete="shipping address-level2"]')
      ).setValue('New York');
      await (
        await browser.$('input[autocomplete="shipping address-level1"]')
      ).setValue('NY');
      await (
        await browser.$('input[autocomplete="shipping postal-code"]')
      ).setValue('10001');
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
      await expect(await browser.$('input[autocomplete="name"]')).toHaveValue(
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

  it('shows a graceful unavailable state without the Worker API', async () => {
    await BasePage.openStaging('store');
    await BasePage.waitForAppReady();

    await expect(
      await browser.$('p=The store is temporarily unavailable.')
    ).toExist();
  });
});
