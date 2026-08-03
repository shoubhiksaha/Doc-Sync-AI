const fs = require('fs');
const path = require('path');

try {
  fs.unlinkSync(path.join(__dirname, '../client_secret_874251779348-l3ac7pbrti4s69go2ija6h6v1o8rc1dc.apps.googleusercontent.com.json'));
  console.log('Deleted client_secret');
} catch (e) {
  console.log(e.message);
}

try {
  fs.unlinkSync(path.join(__dirname, '.env.local'));
  console.log('Deleted .env.local');
} catch (e) {
  console.log(e.message);
}

try {
  fs.rmSync(path.join(__dirname, 'keys'), { recursive: true, force: true });
  console.log('Deleted keys/');
} catch (e) {
  console.log(e.message);
}
