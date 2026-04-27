/**
 * Trigger a browser download for an in-memory `Blob` under the given
 * filename. Creates an anonymous anchor, programmatically clicks it,
 * cleans up the DOM node, and revokes the object URL.
 *
 * Single source of truth — both `DocumentsListComponent` and
 * `ExpiringDocumentsListComponent` go through this helper so that future
 * browser-quirks tweaks (filename sanitisation, delayed `revokeObjectURL`,
 * cross-browser downloads of non-HTTP blobs) land in one place.
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
