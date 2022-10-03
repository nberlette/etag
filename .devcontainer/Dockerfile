FROM mcr.microsoft.com/vscode/devcontainers/base:debian-10

# update system packages and cleanup cache
ARG DEBIAN_FRONTEND=noninteractive
# ensure the PATH has what it needs...
ENV DENO_INSTALL=/deno \
    DENO_DIR=${DENO_INSTALL}/.cache/deno \
    HOMEBREW_PREFIX=/home/.linuxbrew/linuxbrew \
    PNPM_HOME=${HOME}/.local/share/pnpm \
    PATH="${DENO_INSTALL}/bin:${PNPM_HOME}:${HOMEBREW_PREFIX}:${PATH}"

# [Optional] Uncomment this section to install additional OS packages.
# RUN sudo apt-get -y update \
#  && export DEBIAN_FRONTEND=noninteractive \
#  && apt-get -y install --no-install-recommends \
#     gcc build-essentials \
#  && sudo apt-get -y upgrade \
#  && sudo rm -rf /var/lib/apt/lists/* ;

# tidy things up a bit
RUN brew update && brew upgrade && brew cleanup

# install deno@latest and configure ownership
RUN mkdir -p ${DENO_INSTALL:-"/deno"} \
    && curl -fsSL https://deno.land/install.sh | sh \
    && chown -R ${USER:-vscode} ${DENO_INSTALL:-"/deno"}

# install pnpm@latest
RUN mkdir -p ${PNPM_HOME} \
    # install standalone PNPM instance
    && curl -fsSL https://get.pnpm.io/install.sh | sh - \
    # install Node.js LTS with PNPM
    && pnpm env -g use lts \
    # configure homedir for new installation
    && pnpm setup

# node-based build tools and command line programs
RUN pnpm install --global \
    @brlt/n @brlt/eslint-config eslint @brlt/prettier prettier bumpp @changesets/cli zx vitest vercel @railway/cli netlify-cli wrangler miniflare dotenv-vault@latest surge

# homebrew-based build tools and programs
RUN brew install --quiet --overwrite \
    # core utilities, of course :)
    coreutils shfmt shellcheck gnupg gpg-suite jq yq \
    # starship prompt, supabase cli, fly.io cli
    starship supabase/tap/supabase superfly/tap/flyctl \
    # cloudflare cli, deno deploy cli, act (gh actions runner)
    flarectl deployctl act \
    # odds and ends
    lolcat cowsay fortune

# pull some dotfiles into our homedir
ADD --chown=vscode \
  https://rawgit.com/nberlette/dotfiles/.bash_aliases \
  https://rawgit.com/nberlette/dotfiles/.bashrc \
  https://rawgit.com/nberlette/dotfiles/.inputrc \
  https://rawgit.com/nberlette/dotfiles/.path \
  https://rawgit.com/nberlette/dotfiles/.dircolors \
  https://rawgit.com/nberlette/dotfiles/.exports \
  https://rawgit.com/nberlette/dotfiles/.extra \
  https://rawgit.com/nberlette/dotfiles/.functions \
  ${HOME}

RUN mkdir -p ${HOME}/.bashrc.d \
  && mkdir -p ${HOME}/.config/gh \
  && mkdir -p ${HOME}/.gitconfig.d \
  && mkdir -p ${HOME}/.gnupg

ADD --chown=vscode \
  https://rawgit.com/nberlette/dotfiles/.bashrc.d/core.sh \
  https://rawgit.com/nberlette/dotfiles/.bashrc.d/gpg.sh \
  ${HOME}/.bashrc.d/

ADD --chown=vscode \
  https://rawgit.com/nberlette/dotfiles/.config/gh/config.yml \
  ${HOME}/.config/gh/

ADD --chown=vscode \
  https://rawgit.com/nberlette/dotfiles/.config/starship.toml \
  ${HOME}/.config/

ADD --chown=vscode \
  https://rawgit.com/nberlette/dotfiles/.gnupg/gpg-agent.conf \
  https://rawgit.com/nberlette/dotfiles/.gnupg/gpg.conf \
  https://rawgit.com/nberlette/dotfiles/.gnupg/scdaemon.conf \
  ${HOME}/.gnupg/

RUN chmod 700 ${HOME}/.gnupg
