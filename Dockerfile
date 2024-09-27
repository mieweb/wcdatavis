# Container image that runs your code
FROM alpine:3.20

RUN apk add coreutils bash gawk make git rsync nodejs npm python3 py3-pip

ENV DOCKER_ENV=1

# Copies your code file from your action repository to the filesystem path `/` of the container
RUN mkdir -p /app
WORKDIR /app
RUN git config --global --add safe.directory /app


