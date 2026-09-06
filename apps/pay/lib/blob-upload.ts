import { put } from "@vercel/blob";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

/**
 * Persist an uploaded file to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set,
 * otherwise write under `public/` for localdev and return a clickable HTTPS/HTTP URL.
 */
export async function storeUploadedFile(opts: {
  /** Pathname relative to the blob root / public folder, e.g. `lab-bills/prac/id/file.pdf`. */
  pathname: string;
  data: Buffer | ArrayBuffer | Blob;
  contentType: string;
  /** Used to build absolute local URLs when falling back to public/. */
  req?: Request;
}): Promise<string> {
  const pathname = opts.pathname.replace(/\\/g, "/").replace(/^\/+/, "");
  const body = Buffer.isBuffer(opts.data)
    ? opts.data
    : opts.data instanceof ArrayBuffer
      ? Buffer.from(opts.data)
      : Buffer.from(await opts.data.arrayBuffer());

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(pathname, body, {
      access: "public",
      contentType: opts.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }

  const publicDir = path.join(process.cwd(), "public", path.dirname(pathname));
  await mkdir(publicDir, { recursive: true });
  await writeFile(path.join(process.cwd(), "public", pathname), body);

  const host = opts.req?.headers.get("x-forwarded-host") ?? opts.req?.headers.get("host") ?? "localhost:3001";
  const proto = opts.req?.headers.get("x-forwarded-proto") ?? "http";
  // App basePath is /pay — public files are served under /pay/…
  return `${proto}://${host}/pay/${pathname}`;
}
