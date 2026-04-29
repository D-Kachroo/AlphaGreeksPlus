# Deployment

AlphaGreeks+ deploys as one free Render web service.

## Render Settings

- Environment: Node
- Build command: `npm install && npm test`
- Start command: `npm start`
- Required environment variable: `ALPHA_VANTAGE_API_KEY`

## What the Build Does

1. Installs the minimal Node dependencies.
2. Compiles the C++ quant core with `make -C core`.
3. Runs all C++ tests with `make -C core test`.
4. Checks JavaScript syntax with `node --check`.

## Local Verification

```bash
npm install
npm test
npm start
```

Open `http://localhost:3000`.
