# DevOpsRockstars Frontend

## Development

```shell
pip install pre-commit
pre-commit install
npm install
npm run start-server
```

Testing

```shell
npm run ci
npm run ci-headless
```

Start the testing webpack server (on different port than normal development server) and run tests manually.

```shell
npm run start-test-server
# in a different console tab
npm run test
npm run test-headless
```

Run a specific spec

```shell
npx wdio wdio.shared.conf.ts --spec=./specs/basic.spec.ts
```

## Production

The site is deployed to [Vercel](https://vercel.com/) using [Github Actions](https://docs.github.com/en/actions) (see [.github/workflows/main.yml](.github/workflows/main.yml)).

The configuration for the site is in the [terraform folder](terraform).
