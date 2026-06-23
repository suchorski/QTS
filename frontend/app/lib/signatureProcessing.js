// Utilitários de processamento da assinatura no navegador.
// Fluxo: recorte (crop) -> remoção do fundo -> normalização para 150px de altura.

const SIGNATURE_SCALE_MIN = 0.5;
const SIGNATURE_SCALE_MAX = 2;
const SIGNATURE_SCALE_DEFAULT = 1;
const SIGNATURE_OFFSET_MIN = -40;
const SIGNATURE_OFFSET_MAX = 40;
const SIGNATURE_TARGET_HEIGHT = 150;

function clampScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return SIGNATURE_SCALE_DEFAULT;
  return Math.max(
    SIGNATURE_SCALE_MIN,
    Math.min(SIGNATURE_SCALE_MAX, Math.round(numeric * 100) / 100)
  );
}

function clampOffset(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(
    SIGNATURE_OFFSET_MIN,
    Math.min(SIGNATURE_OFFSET_MAX, Math.round(numeric))
  );
}

function loadImageFromSource(source) {
  return new Promise((resolve, reject) => {
    const isString = typeof source === "string";
    const url = isString ? source : URL.createObjectURL(source);
    const image = new Image();

    image.onload = () => {
      if (!isString) URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      if (!isString) URL.revokeObjectURL(url);
      reject(new Error("Não foi possível carregar a imagem"));
    };

    image.src = url;
  });
}

// Recorta a imagem original usando um retângulo em pixels naturais.
async function cropImage(file, rect) {
  const image = await loadImageFromSource(file);

  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const sx = Math.max(0, Math.round(rect.x));
  const sy = Math.max(0, Math.round(rect.y));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sx, sy, width, height, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Falha ao recortar a imagem"));
    }, "image/png", 1);
  });
}

// Remove as bordas totalmente transparentes (após a remoção do fundo).
async function trimTransparentBorders(blob) {
  const image = await loadImageFromSource(blob);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;

  const sourceContext = sourceCanvas.getContext("2d");
  sourceContext.drawImage(image, 0, 0);

  const imageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const { data, width, height } = imageData;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return blob;
  }

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;

  const cropContext = cropCanvas.getContext("2d");
  cropContext.drawImage(sourceCanvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  return new Promise((resolve) => {
    cropCanvas.toBlob((result) => resolve(result || blob), "image/png", 1);
  });
}

// Redimensiona mantendo proporção para uma altura alvo (em px).
async function resizeToHeight(blob, targetHeight) {
  const image = await loadImageFromSource(blob);
  if (!image.height) return blob;

  const height = Math.max(1, Math.round(targetHeight));
  const width = Math.max(1, Math.round((image.width * height) / image.height));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result || blob), "image/png", 1);
  });
}

// Recebe o recorte já feito, remove o fundo e normaliza para 150px de altura.
async function removeBackgroundAndNormalize(croppedBlob, { publicPath }) {
  const { removeBackground } = await import("@imgly/background-removal");

  const withoutBackground = await removeBackground(croppedBlob, {
    publicPath,
    model: "isnet_fp16",
    output: { format: "image/png", quality: 1 },
  });

  const trimmed = await trimTransparentBorders(withoutBackground);
  const normalized = await resizeToHeight(trimmed, SIGNATURE_TARGET_HEIGHT);

  return normalized;
}

export {
  SIGNATURE_SCALE_MIN,
  SIGNATURE_SCALE_MAX,
  SIGNATURE_SCALE_DEFAULT,
  SIGNATURE_OFFSET_MIN,
  SIGNATURE_OFFSET_MAX,
  SIGNATURE_TARGET_HEIGHT,
  clampScale,
  clampOffset,
  cropImage,
  removeBackgroundAndNormalize,
};
