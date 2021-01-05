# devopsrockstars-frontend

install dependencies `npm ci`

run `npm run start-server`

build `npm run build`

test `npm run ci`

## Docker

1. Build the container `docker build . -t devopsrockstars`.
2. Run it `docker run -p 80:80 devopsrockstars` (this won't show any output until an HTTP request issued).

## Pushing the container to Google's Container Registry.

1. `gcloud auth configure-docker`
2. `docker tag devopsrockstars us.gcr.io/tearleads/devopsrockstars-frontend`
3. `docker push us.gcr.io/tearleads/devopsrockstars-frontend`
