import sharp from "sharp";
import fs from "fs";
import path from "path";

// Script para gerar ícones e favicon a partir de logo.png
async function gerarIcones() {
  const logoPath = path.join(process.cwd(), "public", "images", "logo.png");
  const publicPath = path.join(process.cwd(), "public");

  if (!fs.existsSync(logoPath)) {
    console.warn("logo.png não encontrado em public/images/");
    return;
  }

  try {
    console.log("Generating icons...");

    // Favicon 16x16
    await sharp(logoPath)
      .resize(16, 16)
      .toFile(path.join(publicPath, "favicon-16x16.png"));

    // Favicon 32x32
    await sharp(logoPath)
      .resize(32, 32)
      .toFile(path.join(publicPath, "favicon-32x32.png"));

    // Favicon 64x64
    await sharp(logoPath)
      .resize(64, 64)
      .toFile(path.join(publicPath, "favicon-64x64.png"));

    // Apple Touch Icon
    await sharp(logoPath)
      .resize(180, 180)
      .toFile(path.join(publicPath, "apple-touch-icon.png"));

    // Android Chrome Icons
    await sharp(logoPath)
      .resize(192, 192)
      .toFile(path.join(publicPath, "android-chrome-192x192.png"));

    await sharp(logoPath)
      .resize(512, 512)
      .toFile(path.join(publicPath, "android-chrome-512x512.png"));

    console.log("✓ Icons generated successfully!");
  } catch (error) {
    console.error("Erro ao gerar ícones:", error);
  }
}

gerarIcones();
