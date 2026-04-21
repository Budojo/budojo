FROM node:22-alpine

WORKDIR /app

EXPOSE 4200

# npm install runs at startup so volume-mounted source is available
CMD ["sh", "-c", "npm install && npx ng serve --host 0.0.0.0 --poll 500 --proxy-config proxy.conf.json"]
