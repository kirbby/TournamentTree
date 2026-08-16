.PHONY: build test check run deploy-static deploy-supabase

build:
	pnpm build

test:
	pnpm test

check:
	pnpm check

run:
	pnpm dev

deploy-static:
	scripts/deploy-static.sh

deploy-supabase:
	scripts/deploy-supabase.sh
