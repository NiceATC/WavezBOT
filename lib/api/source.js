export function createSourceCalls(api) {
  return {
    search: (source, query, limit) => api.source.search(source, query, limit),
    searchYouTube: (query, limit) => api.source.searchYouTube(query, limit),
    searchSoundCloud: (query, limit) =>
      api.source.searchSoundCloud(query, limit),
    searchAll: (query, limit) => api.source.searchAll(query, limit),
  };
}
