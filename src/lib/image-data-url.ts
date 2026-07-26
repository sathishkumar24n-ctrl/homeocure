export async function imageFileToDataUrl(file: File, maxSize = 720) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file.");
  }
  if (file.size > 3 * 1024 * 1024) {
    throw new Error("Image must be smaller than 3 MB.");
  }

  const source = await readFile(file);
  const img = await loadImage(source);
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image.");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image."));
    img.src = src;
  });
}
