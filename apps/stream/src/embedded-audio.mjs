const TS_PACKET_BYTES = 188;
const MAX_SCAN_PACKETS = 32;

function crc32Mpeg(bytes, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index] << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x80000000)
        ? ((crc << 1) ^ 0x04c11db7) >>> 0
        : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}

function sectionInPacket(bytes, packet) {
  const control = (bytes[packet + 3] >> 4) & 3;
  if (!(control & 1) || !(bytes[packet + 1] & 0x40)) return null;
  let payload = packet + 4;
  if (control & 2) payload += 1 + bytes[payload];
  if (payload >= packet + TS_PACKET_BYTES) return null;
  const start = payload + 1 + bytes[payload];
  if (start + 3 > packet + TS_PACKET_BYTES) return null;
  const end = start + 3 + ((bytes[start + 1] & 0x0f) << 8 | bytes[start + 2]);
  if (end > packet + TS_PACKET_BYTES || end > bytes.length || end - start < 16) {
    return null;
  }
  return { start, end };
}

function englishAac(bytes, entryStart, entryEnd) {
  if (bytes[entryStart] !== 0x0f) return false;
  for (let index = entryStart + 5; index + 2 <= entryEnd;) {
    const descriptorEnd = index + 2 + bytes[index + 1];
    if (descriptorEnd > entryEnd) return false;
    if (
      bytes[index] === 0x0a && bytes[index + 1] >= 4 &&
      bytes[index + 2] === 0x65 &&
      bytes[index + 3] === 0x6e &&
      bytes[index + 4] === 0x67
    ) return true;
    index = descriptorEnd;
  }
  return false;
}

// Reorder PMT entries in place so hls.js, which takes the first AAC PID,
// chooses the English track. No media bytes pass through the app server.
export function preferEnglishAudioInTs(buffer) {
  const bytes = new Uint8Array(buffer);
  for (
    let packet = 0;
    packet + TS_PACKET_BYTES <= bytes.length &&
      packet < MAX_SCAN_PACKETS * TS_PACKET_BYTES;
    packet += TS_PACKET_BYTES
  ) {
    if (bytes[packet] !== 0x47) return { found: false, english: false, reordered: false };
    const section = sectionInPacket(bytes, packet);
    if (!section || bytes[section.start] !== 0x02) continue;
    const { start, end } = section;
    const storedCrc = (
      (bytes[end - 4] << 24) |
      (bytes[end - 3] << 16) |
      (bytes[end - 2] << 8) |
      bytes[end - 1]
    ) >>> 0;
    if (crc32Mpeg(bytes, start, end - 4) !== storedCrc) continue;
    const programInfoLength = ((bytes[start + 10] & 0x0f) << 8) | bytes[start + 11];
    const entriesStart = start + 12 + programInfoLength;
    const entriesEnd = end - 4;
    if (entriesStart >= entriesEnd) continue;
    const entries = [];
    for (let index = entriesStart; index < entriesEnd;) {
      if (index + 5 > entriesEnd) return { found: false, english: false, reordered: false };
      const length = 5 + ((bytes[index + 3] & 0x0f) << 8 | bytes[index + 4]);
      if (index + length > entriesEnd) return { found: false, english: false, reordered: false };
      entries.push({ start: index, end: index + length, audio: bytes[index] === 0x0f });
      index += length;
    }
    const firstAudio = entries.findIndex((entry) => entry.audio);
    const english = entries.findIndex((entry) => englishAac(bytes, entry.start, entry.end));
    if (english < 0) return { found: true, english: false, reordered: false };
    if (firstAudio < 0 || english === firstAudio) {
      return { found: true, english: true, reordered: false };
    }
    const ordered = [
      ...entries.slice(0, firstAudio),
      entries[english],
      ...entries.slice(firstAudio).filter((_, index) => index + firstAudio !== english),
    ];
    let write = entriesStart;
    const copy = bytes.slice(entriesStart, entriesEnd);
    for (const entry of ordered) {
      const from = entry.start - entriesStart;
      bytes.set(copy.subarray(from, from + entry.end - entry.start), write);
      write += entry.end - entry.start;
    }
    const crc = crc32Mpeg(bytes, start, end - 4);
    bytes[end - 4] = crc >>> 24;
    bytes[end - 3] = crc >>> 16 & 0xff;
    bytes[end - 2] = crc >>> 8 & 0xff;
    bytes[end - 1] = crc & 0xff;
    return { found: true, english: true, reordered: true };
  }
  return { found: false, english: false, reordered: false };
}
