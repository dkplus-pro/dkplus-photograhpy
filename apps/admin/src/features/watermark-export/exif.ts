import piexif from "piexifjs";

/** piexifjs 只接受 latin1 字符串，与 JPEG 的 APP1 段字节一一对应。 */
const bytesToLatin1 = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

const latin1ToBytes = (text: string) => {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
};

/** piexifjs.load 对无 EXIF 的数据会抛错，统一视为「无 EXIF」。 */
export const extractExifBytes = (jpegBytes: Uint8Array): Uint8Array | null => {
  try {
    const dict = piexif.load(bytesToLatin1(jpegBytes));
    return latin1ToBytes(piexif.dump(dict));
  } catch {
    return null;
  }
};

/**
 * 把 EXIF 注入 JPEG 并做注入前修正：
 * 1. Orientation 强制为 1——createImageBitmap/canvas 解码时已按原 EXIF 转正像素，
 *    原样保留会让查看器再旋转一次；
 * 2. PixelX/YDimension 同步为实际输出尺寸。
 * 源图本身无 EXIF（如 PNG 转来的 JPEG、CDN 已剥离）则原样返回。
 */
export const injectExifIntoJpeg = async (
  jpegBlob: Blob,
  exifBytes: Uint8Array | null,
  width: number,
  height: number,
): Promise<Blob> => {
  if (!exifBytes) return jpegBlob;
  try {
    const dict = piexif.load(bytesToLatin1(exifBytes));
    if (dict["0th"]) dict["0th"][piexif.ImageIFD.Orientation] = 1;
    if (dict.Exif) {
      dict.Exif[piexif.ExifIFD.PixelXDimension] = width;
      dict.Exif[piexif.ExifIFD.PixelYDimension] = height;
    }
    // canvas 编码产物没有 EXIF，insert 直接落在 SOS 段前。
    const latin1 = bytesToLatin1(new Uint8Array(await jpegBlob.arrayBuffer()));
    const withExif = piexif.insert(piexif.dump(dict), latin1);
    return new Blob([latin1ToBytes(withExif)], { type: "image/jpeg" });
  } catch {
    // EXIF 注入失败不影响导出，仅丢失元数据。
    return jpegBlob;
  }
};

/**
 * 读取源 JPEG 头部字节并提取 EXIF。
 * EXIF 的 APP1 段固定在文件头附近，Range 请求 256KB 足够，
 * 中/低档用它在编码产物上恢复元数据（CDN 处理后的图已丢失）。
 */
export const EXIF_HEAD_BYTES = 256 * 1024;

export const fetchSourceExif = async (
  url: string,
  signal?: AbortSignal,
): Promise<Uint8Array | null> => {
  try {
    const response = await fetch(url, {
      signal,
      headers: { Range: `bytes=0-${EXIF_HEAD_BYTES - 1}` },
    });
    if (!response.ok && response.status !== 206) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    return extractExifBytes(buffer);
  } catch {
    return null;
  }
};
