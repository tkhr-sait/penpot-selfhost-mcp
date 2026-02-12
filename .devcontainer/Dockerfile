FROM node:22

ARG TZ=UTC
# macOSのデフォルト。Linuxでは devcontainer.json の updateRemoteUserUID で自動リマップされる
ARG USER_UID=501
ARG USER_GID=20

ENV TZ=${TZ}

# Install basic development tools and iptables/ipset
RUN apt update && \
  apt install -y \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  vim \
  locales

# Configure Japanese locale
RUN sed -i 's/^# *ja_JP.UTF-8 UTF-8/ja_JP.UTF-8 UTF-8/' /etc/locale.gen && \
  locale-gen

ENV LANG=ja_JP.UTF-8
ENV LC_ALL=ja_JP.UTF-8

# ターゲットUID/GIDと競合する既存ユーザー/グループを処理
# (例: node:22イメージの node ユーザー UID=1000)
RUN existing_user=$(getent passwd ${USER_UID} | cut -d: -f1 || true) && \
  if [ -n "$existing_user" ] && [ "$existing_user" != "devuser" ]; then \
    userdel "$existing_user"; \
  fi && \
  existing_group=$(getent group ${USER_GID} | cut -d: -f1 || true) && \
  if [ -n "$existing_group" ] && [ "$existing_group" != "devuser" ]; then \
    groupmod -g 65534 "$existing_group" 2>/dev/null || true; \
  fi

# Create devuser with specified UID/GID (reuse existing IDs if they match)
RUN if getent group ${USER_GID} >/dev/null; then \
    true; \
  else \
    groupadd --gid ${USER_GID} devuser; \
  fi \
  && if getent passwd ${USER_UID} >/dev/null; then \
    true; \
  else \
    useradd --uid ${USER_UID} --gid ${USER_GID} -m -s /bin/bash devuser; \
  fi

# Grant sudo privileges to the UID
RUN echo "#${USER_UID} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/devuser && \
  chmod 0440 /etc/sudoers.d/devuser

# Ensure the UID has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R ${USER_UID}:${USER_GID} /usr/local/share

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R ${USER_UID}:${USER_GID} /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions
RUN HOME_DIR=$(getent passwd ${USER_UID} | cut -d: -f6 || echo /home/devuser) && \
  mkdir -p /workspace "${HOME_DIR}/.claude" && \
  chown -R ${USER_UID}:${USER_GID} /workspace "${HOME_DIR}/.claude"

WORKDIR /workspace

USER ${USER_UID}:${USER_GID}

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

ENV SHELL=/bin/bash

# Install Claude
#RUN npm install -g @anthropic-ai/claude-code
RUN curl -fsSL https://claude.ai/install.sh | bash
RUN echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc