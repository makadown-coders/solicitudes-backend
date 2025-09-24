import * as argon2 from 'argon2';
(async () => {
  const pwd = process.argv[2] || 'ChangeMe123!';
  const hash = await argon2.hash(pwd);
  console.log('Password:', pwd);
  console.log('argon2id hash:', hash);
})();