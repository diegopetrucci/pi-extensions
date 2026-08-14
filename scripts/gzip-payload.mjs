import { readFile, stat } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const MAX_TARBALL_BYTES = 8 * 1024 * 1024;
const MAX_TAR_PAYLOAD_BYTES = 16 * 1024 * 1024;

export async function gzipPayloadEqual(leftPath, rightPath) {
  try {
    const [leftStat, rightStat] = await Promise.all([stat(leftPath), stat(rightPath)]);
    if (leftStat.size > MAX_TARBALL_BYTES || rightStat.size > MAX_TARBALL_BYTES) return false;
    const [left, right] = await Promise.all([readFile(leftPath), readFile(rightPath)]);
    const options = { maxOutputLength: MAX_TAR_PAYLOAD_BYTES };
    return gunzipSync(left, options).equals(gunzipSync(right, options));
  } catch {
    return false;
  }
}
