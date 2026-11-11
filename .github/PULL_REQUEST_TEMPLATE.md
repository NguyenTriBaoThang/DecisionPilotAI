## Description
<!-- Provide a concise summary of the change, motivation, and context. -->

## Type of Change
- [ ] 🚀 New feature (`feat`)
- [ ] 🐛 Bug fix (`fix`)
- [ ] 📝 Documentation update (`docs`)
- [ ] 🎨 UI / Styling change (`style` / `ui`)
- [ ] ⚡ Performance optimization (`perf`)
- [ ] 🧪 Tests or Benchmarks (`test`)
- [ ] 🔧 Refactoring or Chore (`refactor` / `chore`)

## Related Issues
<!-- Link relevant issues: e.g. Closes #123 -->

## Verification Checklist
- [ ] Python test suite passes: `python -m pytest -q`
- [ ] Data pipeline validation passes: `python -m scripts.pipeline validate`
- [ ] Frontend tests and build pass: `npm --prefix frontend test && npm --prefix frontend run build`
- [ ] Documentation portal builds cleanly: `npm --prefix docs-site run build`
- [ ] Database migrations tested if schema was altered (`alembic upgrade head`)
- [ ] Documentation updated if endpoints or parameters changed

