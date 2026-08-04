# Quality Gate: Temporary Debug Tags Check

This quality gate checks the codebase for temporary debug instrumentation tags and preventing accidental check-ins of local debug code to version control.

## Monitored Targets
The quality gate scans for the following items inside tracked files:
- `[Y_TEMP_DEBUG:`
- `Y_TEMP_DEBUG`
- `console.log` statements containing `Y_TEMP_DEBUG`
- `console.warn` statements containing `Y_TEMP_DEBUG`
- `console.error` statements containing `Y_TEMP_DEBUG`

## Exclusions
The command line quality gate ignores the following directories:
- `node_modules/`
- `dist/`
- `build/`
- `.git/`

## Usage
Run the quality gate locally or in your CI/CD pipeline using:
```bash
pnpm qa:debug-tags
```

## Recommended Pre-Merge Validation Checklist
Before merging any pull request, developers should run:
1. `pnpm secret-scan` (Validates no raw database URLs or credentials are committed)
2. `pnpm qa:debug-tags` (Validates no temporary debugging logs exist in production-bound files)
3. `pnpm lint` (Validates TypeScript compile-time and code quality criteria)
4. `pnpm build` (Confirms production asset bundles compile successfully)
