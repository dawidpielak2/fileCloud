FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN chown -R node:node /app
USER node
COPY --chown=node:node package*.json ./
RUN npm ci --only=production
COPY --chown=node:node . .
EXPOSE 5000
CMD ["node", "server.js"]
