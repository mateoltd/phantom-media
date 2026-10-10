# Independently captured extension receipts

Captured 9 October 2026 through the refactor's own adapters, using the publicly
listed Prime Gaming extension. These are data receipts, not investigation code.

- `viewer-request.json`: owned bare-client-ID query, variables, returned viewer
  URL and capture provenance. Catalog identity can name another version; the
  viewer URL records the version/package that actually resolved.
- `panel.html`: fetched 523-byte hosted HTML. Retained exactly; never executed.
- `collection-receipt.json`: asset metadata, byte totals and partial-collection
  failure. The helper was 126,547 bytes; the referenced main bundle exceeded the
  crawler's 2 MB file budget. Binary JS is not stored here.
- `icon-request.json`: independent single-entry catalog capture on 10 October
  2026, confirming `iconURLs.square100` and the public PNG response. Its image
  version differs from the catalog version; retain the returned URL verbatim.
  Response request IDs were removed.

All URLs are public package/helper locations. No tokens, signatures, account
context or authenticated backend data is included. Tests use injected asset
responses to verify bounds, redirects and reference traversal without live calls.
