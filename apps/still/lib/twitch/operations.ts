/** Pinned behavioral quartets; search autocomplete was captured independently. */
export const PERSISTED = {
  VideoPlayer_ChapterSelectButtonVideo: { hash: "71835d5ef425e154bf282453a926d99b328cdc5e32f36d3a209d0f4778b41203", family: "chapters" },
  ContentClassificationContext: { hash: "57bb6c1aca3631b2b3e74b1c3c8adbecbbcc3becb70ec52d7c5ef0f90d7c3b02", family: "classification" },
  UseViewCount: { hash: "95e6bd7acfbb2f220c17e387805141b77b43b18e5b27b4f702713e9ddbe6b907", family: "view-count", get: true },
  SearchTray_SearchSuggestions: { hash: "2749d8bc89a2ddd37518e23742a4287becd3064c40465d8b57317cabd0efe096", family: "search-autocomplete" },
} as const;
export type PersistedName = keyof typeof PERSISTED;
