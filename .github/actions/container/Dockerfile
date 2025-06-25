# Container image that runs your code
FROM alpine:3.20

RUN apk add coreutils bash gawk make git rsync nodejs npm python3 py3-pip

ENV DOCKER_ENV=1

# You need this when testing interactively, but not when using this as a GitHub action.
# ADD --keep-git-dir=true git@github.mieweb.com:datavis/wcdatavis.git#v2.2.2 /github/workspace

# Copies your code file from your action repository to the filesystem path `/` of the container
COPY entrypoint.sh /entrypoint.sh
RUN mkdir -p /github/workspace
WORKDIR /github/workspace

# Code file to execute when the docker container starts up (`entrypoint.sh`)
ENTRYPOINT ["/entrypoint.sh"]

RUN git clone https://github.com/pyenv/pyenv.git /root/.pyenv
RUN git clone https://github.com/pyenv/pyenv-virtualenv.git /root/.pyenv/plugins/pyenv-virtualenv
