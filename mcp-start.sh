#!/bin/bash
cd /Users/jesusbarboza/Documents/Programming/mrc/mcp-mrc
export $(cat .env.dev | grep -v '^#' | xargs)
node --import tsx src/mcp-stdio.ts
