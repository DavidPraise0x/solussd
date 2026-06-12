FROM node:22-alpine

ENV RENDER=true
ENV SOLANA_RPC_URL=https://api.devnet.solana.com
ENV DB_PATH=./data/solussd.db
ENV ENCRYPTION_KEY=solussd-dev-key-change-in-prod-32

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 5500

CMD ["npm", "start"]
