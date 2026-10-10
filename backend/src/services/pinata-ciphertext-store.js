const CIPHERTEXT_MIME = 'application/octet-stream';
const CID_PATTERN = /^[A-Za-z0-9]{20,120}$/;

/** Pin/unpin gateway adapter for encrypted opaque evidence envelopes. */
export function createPinataCiphertextStore({ jwt, fetchImpl = fetch }) {
  return {
    async put(bytes) {
      if (!jwt) throw new Error('Penyimpanan ciphertext belum dikonfigurasi.');
      const body = new FormData();
      body.append('file', new Blob([bytes], { type: CIPHERTEXT_MIME }), 'evidence.enc');
      const response = await fetchImpl('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body,
      });
      if (!response.ok) throw new Error('Penyimpanan ciphertext gagal.');
      const result = await response.json();
      if (typeof result.IpfsHash !== 'string' || !CID_PATTERN.test(result.IpfsHash)) {
        throw new Error('Penyimpanan ciphertext mengembalikan CID tidak valid.');
      }
      return result.IpfsHash;
    },
    async get(cid) {
      if (!CID_PATTERN.test(cid)) return null;
      const response = await fetchImpl(`https://gateway.pinata.cloud/ipfs/${encodeURIComponent(cid)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Ciphertext tidak dapat diambil.');
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
