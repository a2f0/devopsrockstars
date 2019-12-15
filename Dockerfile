# Stage 1 - Application build

FROM node:10.16.2 as build

# Make a directory for the application
RUN mkdir /usr/src/app
WORKDIR /usr/src/app

ENV PATH /usr/src/app/node_modules/.bin:$PATH
COPY package.json /usr/src/app/package.json

RUN npm install --silent
RUN npm install react-scripts -g --silent

COPY . /usr/src/app
RUN npm run build

# Stage 2 - Production lightweight build

FROM nginx:1.17.6-alpine
COPY --from=build /usr/src/app/build /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html/*
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

