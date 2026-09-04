Prebuilt Linux amd64 runtime for GrokBot Social. The release contains the same application, Caddy frontend and PostgreSQL images exercised by the passing deployment checks. Publication also requires the PostgreSQL integration tests, native adapter checks and dependency advisory gate to pass.

Download `runtime-images.tar.gz`, `deployment.tar.gz` and `SHA256SUMS` together. Verify the checksums before extracting, then follow the bundled deployment README. The bundle contains example configuration only; create production secrets on the server. No registry login or on-server application build is required.

A published runtime is not proof of production hosting, OAuth sign-in, database restore or actual native Grok Bot acceptance. Those checks remain part of deployment.
