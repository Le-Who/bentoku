const images = new Map<string, Promise<HTMLImageElement>>();

/** Share successful and in-flight images across presenters, including partial retries. */
export function loadImageAsset(path: string): Promise<HTMLImageElement> {
  const url = new URL(path, document.baseURI).href;
  const existing = images.get(url);
  if (existing) return existing;
  const image = new Image();
  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${path}`));
  }).catch((error: unknown) => {
    images.delete(url);
    throw error;
  });
  images.set(url, loading);
  image.src = url;
  return loading;
}
