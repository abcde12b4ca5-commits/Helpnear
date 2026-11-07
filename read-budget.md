# Read budget (Spark hard caps, verify in Phase 1)
1. Every list: `limit(20)` + manual "Load more".
2. No collection listeners (only one open chat thread, Stage 2).
3. Cache config/categories/zones (memory + short TTL); read `config/app` once per session.
4. Denormalize list fields. 5. Rules `get()/exists()` are billed reads.
6. `maintenanceMode` flag; Blaze only with explicit approval.
