# Channel identity hydration

`channels.json` records one independent, anonymous, directed `users(logins:)`
request for Rubius and Auronplay on 2026-10-10. It pins the request and response
shape used for search hydration; stream nullity is point-in-time evidence, not a
lasting offline classification. Request IDs were excluded. No investigation
implementation was used.

`popularity.json` captures the reported `illo` collision: three directed names,
including public `followers.totalCount` and `roles.isPartner`. It backs durable
audience ranking independently of live viewers. Partner status is a ranking
signal; it is not an invented verification badge. Counts are point-in-time
observations, never static per-channel ranking overrides.

`candidates-{rubius,ricky,apple,illo}.json` pin independent directed public
`searchFor` requests on 2026-10-10, each returning 40 CHANNEL candidates using
`options.targets[{index:CHANNEL,limit:40}]`. The default unbounded selection
returned ten; `channels(first:)` is not accepted. These receipts verify the
distinct `searchFor` field, not the terminal `search` field. Request IDs were
excluded. No cursor traversal or integrity credentials were used. They include
small accounts and contextual matches, not just a famous-name roster. Forty
results are a first-page sample, not the total matching population.

`autocomplete-{rubius,ricky,apple,illo}.json` pin independent native persisted
`SearchTray_SearchSuggestions` requests on 2026-10-10. The quartet includes the
operation name, hash, variables and sanitized response. Offline content is
explicitly requested. Channel content self-carries login, avatar, live state and
verification; text-only suggestions have null content and cannot become rows.
No identity hydration is required for the first complete result.
