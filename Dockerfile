FROM mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d
WORKDIR /app
ENV CI=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
CMD ["npm", "run", "check"]
