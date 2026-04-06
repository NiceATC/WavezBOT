export function createPlaylistCalls(api) {
  return {
    list: () => api.playlist.list(),
    getTracks: (playlistId) => api.playlist.getTracks(playlistId),
    create: (name) => api.playlist.create(name),
    update: (playlistId, data) => api.playlist.update(playlistId, data),
    remove: (playlistId) => api.playlist.remove(playlistId),
    addTrack: (playlistId, data) => api.playlist.addTrack(playlistId, data),
    removeTrack: (playlistId, trackId) =>
      api.playlist.removeTrack(playlistId, trackId),
    reorderTracks: (playlistId, trackIds) =>
      api.playlist.reorderTracks(playlistId, trackIds),
  };
}
