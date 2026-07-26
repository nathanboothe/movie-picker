// This app doesn't need offline support, but Chrome/Android require an
// active service worker with a fetch handler before they'll treat the site
// as an installable app rather than just a bookmark. This one does nothing
// but let every request pass through to the network as normal.
self.addEventListener('fetch', () => {});
