# Stand-in for CI-built release images in the deploy dry-run test. One image serves as app, tools, and infra stub.
FROM node:24-bookworm-slim
ARG SHA=infra
ARG BEHAVIOR=ok
RUN echo "$SHA" > /etc/stub-sha && echo "$BEHAVIOR" > /etc/stub-behavior
COPY server.mjs /srv/server.mjs
COPY corepack-stub.sh /usr/local/bin/corepack
RUN chmod +x /usr/local/bin/corepack
CMD ["node", "/srv/server.mjs"]
