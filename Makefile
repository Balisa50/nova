# NOVA. Run `make help` to see the targets.
#
# Windows note: install GNU make with `choco install make`, or run the
# commands under each target by hand. CI runs these targets on Linux.

PY      ?= python
PIP     ?= $(PY) -m pip
BACKEND := backend
FRONT   := frontend

.DEFAULT_GOAL := help
.PHONY: help setup setup-backend setup-frontend lint format test test-backend build run run-backend run-frontend clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "};{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: setup-backend setup-frontend ## Install backend and frontend dependencies

setup-backend: ## Install Python dependencies (CPU-only torch)
	$(PIP) install --upgrade pip
	$(PIP) install -r $(BACKEND)/requirements.txt
	$(PIP) install pytest ruff

setup-frontend: ## Install Node dependencies
	cd $(FRONT) && npm ci

lint: ## Lint Python and TypeScript
	$(PY) -m ruff check $(BACKEND)
	cd $(FRONT) && npm run lint

format: ## Auto-format Python
	$(PY) -m ruff format $(BACKEND)
	$(PY) -m ruff check --fix $(BACKEND)

test: test-backend ## Run the test suite

test-backend: ## Run backend tests
	cd $(BACKEND) && $(PY) -m pytest -q

build: ## Production build of the frontend
	cd $(FRONT) && npm run build

run: ## Reminder: backend and frontend run in separate shells
	@echo "Run 'make run-backend' and 'make run-frontend' in two shells."

run-backend: ## Serve the FastAPI backend on :8000
	cd $(BACKEND) && $(PY) -m uvicorn app.main:app --reload --port 8000

run-frontend: ## Serve the Next.js frontend on :3000
	cd $(FRONT) && npm run dev

clean: ## Remove build and cache artefacts
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type d -name .pytest_cache -prune -exec rm -rf {} +
	rm -rf $(FRONT)/.next
