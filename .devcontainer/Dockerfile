FROM oven/bun:latest

# Set working directory
WORKDIR /workspaces

# Install git and other utilities
RUN apt-get update && apt-get install -y \
    git \
    curl \
    vim \
    bash \
    zsh \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

# The oven/bun image uses 'bun' as the user instead of 'node'
# Ensure correct permissions for the workspace
RUN mkdir -p /workspaces && chown -R bun:bun /workspaces

# Set bash as the default shell
SHELL ["/bin/bash", "-c"]

# Switch to non-root user
USER bun

# Configure bash as the default shell for the user
RUN echo 'export PATH=/workspaces/node_modules/.bin:$PATH' >> ~/.bashrc && \
    echo 'PS1="\[\033[01;32m\]\u@bun-dev\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ "' >> ~/.bashrc

# Add Bun's bin directory to PATH
ENV PATH=/workspaces/node_modules/.bin:$PATH
ENV SHELL=/bin/bash

# Start in the workspace directory
WORKDIR /workspaces
