import { generateKeyPair, exportJWK } from 'jose';
import { writeFileSync, mkdirSync } from 'fs';

(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    extractable: true,
    modulusLength: 2048
  });
  const kid = `kid_${Date.now()}`;
  const pub = await exportJWK(publicKey) as any;
  const priv = await exportJWK(privateKey) as any;
  pub.kid = kid; pub.alg = 'RS256'; priv.kid = kid; priv.alg = 'RS256';
  mkdirSync('keys', { recursive: true });
  writeFileSync('keys/current_public.jwk.json', JSON.stringify(pub, null, 2));
  writeFileSync('keys/current_private.jwk.json', JSON.stringify(priv, null, 2));
  writeFileSync('keys/ACTIVE_KID', kid);
  console.log('Generated keys with', kid);
})();
