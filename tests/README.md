# Verification boundaries

Node's built-in test runner validates scaffold integrity without adding a test framework. TypeScript project references validate module contracts; ESLint and Prettier run in CI. These checks do not validate filtering, runtime wire validation, browser compatibility, or deployed services.

During implementation add focused unit tests beside the owning package, protocol/serialization tests at the API boundary, and browser or service integration tests under tests/integration. Avoid real political data and personal browsing history in fixtures.
