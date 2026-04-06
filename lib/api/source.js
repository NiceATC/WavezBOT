export function createSourceCalls(api) {
  return {
    searchYouTube: (query, limit) => api.source.searchYouTube(query, limit),
    searchSoundCloud: (query, limit) =>
      api.source.searchSoundCloud(query, limit),
    searchAll: (query, limit) => api.source.searchAll(query, limit),
  };
}
